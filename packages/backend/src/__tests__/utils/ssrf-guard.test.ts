/**
 * Negative tests for the SSRF guard (issue #18).
 *
 * DNS and HTTP are mocked: no test here touches a real network address.
 * In particular, nothing probes 169.254.169.254 or any internal address —
 * blocking is verified by the guard's decision, not by a real connection.
 */
import dns from 'dns';
import axios from 'axios';
import {
  isBlockedIp,
  assertSafeScrapeUrl,
  assertSafeExternalLink,
  fetchWithGuardedRedirects,
  resolveRedirectChain,
} from '../../utils/ssrf-guard';

jest.mock('dns', () => ({
  promises: { lookup: jest.fn() },
}));
jest.mock('axios');

const mockedLookup = dns.promises.lookup as unknown as jest.Mock;
const mockedGet = axios.get as unknown as jest.Mock;

// Public address for every hostname lookup in these tests.
const PUBLIC = [{ address: '93.184.216.34', family: 4 }];

beforeEach(() => {
  jest.clearAllMocks();
  mockedLookup.mockResolvedValue(PUBLIC);
});

describe('isBlockedIp', () => {
  it.each([
    // IPv4: private, loopback, link-local (cloud metadata), CGNAT, reserved
    '10.0.0.5',
    '172.16.0.9',
    '192.168.1.1',
    '127.0.0.1',
    '0.0.0.0',
    '169.254.169.254',
    '100.64.0.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '198.18.0.1', // benchmarking — ipaddr.js alone calls this unicast
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
  ])('blocks IPv4 %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34'])('allows public IPv4 %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it.each([
    '::1',
    '::',
    'fe80::1',
    'fe81::1', // link-local /10, not just fe80: literal
    'febf::1',
    'fc00::1',
    'fc01::1', // unique-local /7, not just fc00:/fd00: literals
    'fd12::1',
    'ff02::1',
    '::ffff:127.0.0.1', // IPv4-mapped IPv6 loopback
    '::ffff:7f00:1',
    '::ffff:169.254.169.254', // IPv4-mapped IPv6 metadata
    '2002:7f00:1::', // 6to4 embeds IPv4 127.0.0.1
    '2001:0:4137:9e76:3c2b:0:0:0', // Teredo
    '64:ff9b::7f00:1', // NAT64 well-known prefix embeds IPv4
    '100::1', // discard-only
    '2001:db8::1', // documentation
    'not-an-ip',
    '',
  ])('blocks IPv6/special %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(['2606:4700:4700::1111', '2a00:1450:4001::1'])('allows public IPv6 %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe('assertSafeScrapeUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeScrapeUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertSafeScrapeUrl('ftp://example.com/x')).rejects.toThrow();
    await expect(assertSafeScrapeUrl('gopher://example.com/')).rejects.toThrow();
  });

  it('rejects embedded credentials', async () => {
    await expect(assertSafeScrapeUrl('https://user:pass@example.com/')).rejects.toThrow(
      /credentials/
    );
  });

  it('rejects literal blocked IPs without a DNS lookup', async () => {
    await expect(assertSafeScrapeUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /not allowed/
    );
    await expect(assertSafeScrapeUrl('http://[::ffff:7f00:1]/')).rejects.toThrow(/not allowed/);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('rejects a hostname resolving to a blocked address', async () => {
    mockedLookup.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);
    await expect(assertSafeScrapeUrl('https://evil.example.com/')).rejects.toThrow(/not allowed/);
  });

  it('rejects a hostname with any blocked address among several', async () => {
    mockedLookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.0.7', family: 4 },
    ]);
    await expect(assertSafeScrapeUrl('https://mixed.example.com/')).rejects.toThrow(/not allowed/);
  });

  it('rejects an unresolvable hostname', async () => {
    mockedLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertSafeScrapeUrl('https://nonexistent.example.invalid/')).rejects.toThrow(
      /resolve/
    );
  });

  it('accepts a public hostname', async () => {
    await expect(assertSafeScrapeUrl('https://example.com/recipes/soup')).resolves.toContain(
      'example.com'
    );
  });

  it('accepts a bracketed public IPv6 literal', async () => {
    await expect(assertSafeScrapeUrl('http://[2606:4700:4700::1111]/x')).resolves.toContain(
      '2606:4700:4700::1111'
    );
  });
});

describe('assertSafeExternalLink', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('rejects %s', (url) => {
    expect(() => assertSafeExternalLink(url)).toThrow();
  });

  it('accepts http(s) URLs', () => {
    expect(() => assertSafeExternalLink('https://example.com/recipe')).not.toThrow();
    expect(() => assertSafeExternalLink('http://example.com/')).not.toThrow();
  });
});

describe('fetchWithGuardedRedirects', () => {
  it('returns a direct 200 response', async () => {
    mockedGet.mockResolvedValue({ status: 200, headers: {}, data: '<html/>' });
    const res = await fetchWithGuardedRedirects('https://example.com/a');
    expect(res.status).toBe(200);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to a public host', async () => {
    mockedGet
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: 'https://other.example.com/b' },
        data: '',
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: 'ok' });
    const res = await fetchWithGuardedRedirects('https://example.com/a');
    expect(res.status).toBe(200);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(mockedGet).toHaveBeenNthCalledWith(2, 'https://other.example.com/b', expect.anything());
  });

  it('resolves relative redirect targets against the current URL', async () => {
    mockedGet
      .mockResolvedValueOnce({ status: 301, headers: { location: '/b' }, data: '' })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: 'ok' });
    await fetchWithGuardedRedirects('https://example.com/a');
    expect(mockedGet).toHaveBeenNthCalledWith(2, 'https://example.com/b', expect.anything());
  });

  it('blocks a redirect to an internal address (the old axios bypass)', async () => {
    mockedGet.mockResolvedValueOnce({
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      data: '',
    });
    await expect(fetchWithGuardedRedirects('https://example.com/a')).rejects.toThrow(/not allowed/);
    // The internal address was never fetched.
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('blocks a redirect to a hostname resolving to an internal address', async () => {
    mockedGet.mockResolvedValueOnce({
      status: 302,
      headers: { location: 'https://internal.example.com/x' },
      data: '',
    });
    mockedLookup.mockImplementation(async (host: string) => {
      if (host === 'internal.example.com') return [{ address: '10.0.0.9', family: 4 }];
      return PUBLIC;
    });
    await expect(fetchWithGuardedRedirects('https://example.com/a')).rejects.toThrow(/not allowed/);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('stops after the redirect limit', async () => {
    mockedGet.mockResolvedValue({
      status: 302,
      headers: { location: 'https://example.com/loop' },
      data: '',
    });
    await expect(fetchWithGuardedRedirects('https://example.com/a')).rejects.toThrow(
      /Too many redirects/
    );
  });
});

describe('resolveRedirectChain', () => {
  it('returns the final URL after validated redirects', async () => {
    mockedGet
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: 'https://final.example.com/r' },
        data: '',
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: '' });
    await expect(resolveRedirectChain('https://example.com/a')).resolves.toBe(
      'https://final.example.com/r'
    );
  });

  it('blocks a chain that ends at an internal address', async () => {
    mockedGet.mockResolvedValueOnce({
      status: 302,
      headers: { location: 'http://127.0.0.1/admin' },
      data: '',
    });
    await expect(resolveRedirectChain('https://example.com/a')).rejects.toThrow(/not allowed/);
  });
});
