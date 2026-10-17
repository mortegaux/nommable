/**
 * SSRF guard for server-side fetches of user-influenced URLs.
 *
 * Recipe import fetches arbitrary URLs server-side (axios + a Python
 * subprocess) and image localization downloads attacker-influenced image URLs,
 * so a malicious URL could probe the internal network, hit cloud metadata
 * endpoints (169.254.169.254), or reach loopback services.
 *
 * Two layers:
 * 1. `assertSafeScrapeUrl` — validates the scheme, rejects embedded
 *    credentials, and requires every DNS-resolved address to be a globally
 *    routable public IP.
 * 2. `fetchWithGuardedRedirects` — follows redirects manually, re-validating
 *    every hop. Plain axios `maxRedirects` does NOT re-validate redirect
 *    targets, so a public URL 302-redirecting to an internal address would
 *    otherwise bypass layer 1 entirely.
 *
 * IP classification uses `ipaddr.js` (vetted, widely used) instead of
 * hand-rolled CIDR math: the previous hand-rolled check missed IPv4-mapped
 * IPv6 (`::ffff:127.0.0.1`), part of the unique-local range (`fc01::–fcff::`),
 * and IPv6 transition mechanisms (6to4, Teredo) that embed IPv4 addresses.
 *
 * Residual risks, accepted for this app's threat model (authenticated users
 * importing recipes):
 * - DNS rebinding / TOCTOU between validation and fetch: an address can
 *   change between the DNS lookup and the TCP connect. Closing this needs
 *   DNS-pinned connections (custom lookup + Host handling), which axios does
 *   not support out of the box.
 * - A redirect target that starts redirecting again between the TS
 *   redirect-resolution pass and the Python scraper's own fetch of the final
 *   URL (same TOCTOU class as above).
 */
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as dns from 'dns';
import ipaddr from 'ipaddr.js';

const MAX_REDIRECTS = 5;
const DEFAULT_MAX_CONTENT_LENGTH = 10 * 1024 * 1024; // 10 MB

// ipaddr.js reports these as 'unicast' even though they are not globally
// routable / can reach internal resources. Block them explicitly.
const EXTRA_BLOCKED_V4 = ['198.18.0.0/15']; // benchmarking (RFC 2544)
const EXTRA_BLOCKED_V6 = [
  '64:ff9b::/96', // NAT64 well-known prefix: embeds an IPv4 address
  '100::/64', // discard-only (RFC 6666)
];

/**
 * True when the IP must never be fetched server-side: anything that is not
 * a globally routable public address. Unparseable input is blocked by default.
 */
export function isBlockedIp(ip: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(ip);
  } catch {
    return true;
  }
  if (parsed.kind() === 'ipv4') {
    const v4 = parsed as ipaddr.IPv4;
    if (v4.range() !== 'unicast') return true;
    return EXTRA_BLOCKED_V4.some((cidr) =>
      v4.match(ipaddr.parseCIDR(cidr) as [ipaddr.IPv4, number])
    );
  }
  // IPv6: mapped addresses (range 'ipv4Mapped'), 6to4, Teredo, unique-local,
  // link-local, loopback, multicast, reserved and unspecified are all
  // non-'unicast' and therefore blocked. Only plain global unicast passes.
  const v6 = parsed as ipaddr.IPv6;
  if (v6.range() !== 'unicast') return true;
  return EXTRA_BLOCKED_V6.some((cidr) => v6.match(ipaddr.parseCIDR(cidr) as [ipaddr.IPv6, number]));
}

/**
 * Validate a user-supplied URL for server-side fetching. Returns the
 * normalized URL string. Throws on anything that is not a public http(s)
 * destination.
 */
export async function assertSafeScrapeUrl(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL provided');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be imported');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not allowed');
  }

  const host = parsed.hostname;
  // WHATWG URL keeps brackets on IPv6 literals in `hostname`
  // (`[::1]`), which no IP parser accepts — strip them so the literal-IP
  // check below (and the DNS lookup) see the bare address.
  const bareHost = host.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(bareHost) && isBlockedIp(bareHost)) {
    throw new Error('URL host is not allowed');
  }

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(bareHost, { all: true });
  } catch {
    throw new Error('Could not resolve URL host');
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedIp(a.address))) {
    throw new Error('URL host is not allowed');
  }

  return parsed.toString();
}

/**
 * Lightweight validation for URLs that are stored and rendered as links
 * (e.g. a recipe's `sourceUrl`) but never fetched server-side. No DNS
 * lookup: only the scheme and embedded credentials matter. This closes the
 * `javascript:`-href stored-XSS vector on pages that render the link.
 */
export function assertSafeExternalLink(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL provided');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not allowed');
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetch a URL, following redirects manually with `assertSafeScrapeUrl`
 * re-validation on every hop. `axios` with `maxRedirects` does not
 * re-validate redirect targets, so it must not be used directly for
 * user-influenced URLs.
 *
 * The initial URL is assumed already validated by the caller; every redirect
 * target is validated before it is followed. Returns the final response.
 */
export async function fetchWithGuardedRedirects(
  initialUrl: string,
  axiosConfig: AxiosRequestConfig = {}
): Promise<AxiosResponse> {
  let currentUrl = initialUrl;
  const maxContentLength = axiosConfig.maxContentLength ?? DEFAULT_MAX_CONTENT_LENGTH;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await axios.get(currentUrl, {
      ...axiosConfig,
      maxContentLength,
      maxRedirects: 0,
      // Accept 3xx here so the loop — not axios — decides what to follow.
      validateStatus: () => true,
    });

    const location = response.headers?.location;
    if (
      REDIRECT_STATUSES.has(response.status) &&
      typeof location === 'string' &&
      location.length > 0
    ) {
      if (hop === MAX_REDIRECTS) {
        throw new Error('Too many redirects');
      }
      // Resolve relative Location headers against the current URL, then
      // re-validate the target (scheme, credentials, DNS → public IP).
      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = await assertSafeScrapeUrl(nextUrl);
      continue;
    }
    return response;
  }
  throw new Error('Too many redirects');
}

/**
 * Resolve a URL's redirect chain (with per-hop validation) and return the
 * final URL. Used for the Python scraper path: `recipe-scrapers` follows
 * redirects with its own client, so it receives the already-resolved final
 * URL instead of the user-supplied one.
 */
export async function resolveRedirectChain(rawUrl: string): Promise<string> {
  let currentUrl = await assertSafeScrapeUrl(rawUrl);
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const response = await axios.get(currentUrl, {
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: 10000,
      maxContentLength: DEFAULT_MAX_CONTENT_LENGTH,
    });
    const location = response.headers?.location;
    if (
      REDIRECT_STATUSES.has(response.status) &&
      typeof location === 'string' &&
      location.length > 0
    ) {
      currentUrl = await assertSafeScrapeUrl(new URL(location, currentUrl).toString());
      continue;
    }
    return currentUrl;
  }
  throw new Error('Too many redirects');
}
