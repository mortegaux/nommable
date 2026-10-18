/**
 * System status service (issue #23) — read-only admin diagnostics.
 *
 * Reports the installed version, the latest GitHub release (cached, never
 * auto-applied), uptime, DB/upload sizes, migration status, and the
 * last-backup placeholder. Every section degrades gracefully: a failed
 * GitHub check or an unreadable directory never fails the whole response.
 *
 * No Docker socket, no self-modification, no auto-update — detect and
 * explain only.
 */
import fs from 'fs';
import path from 'path';
import { config } from '../../config';
import { AppDataSource } from '../../db/data-source';
import {
  AvailableReleaseInfo,
  SystemStatus,
  UpdateCheckStatus,
} from '@nommable/shared';

const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/mortegaux/nommable/releases/latest';
const RELEASE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — unauthenticated GitHub limit is 60 req/hr
const RELEASE_FETCH_TIMEOUT_MS = 10_000;
const MAX_WALK_DEPTH = 10;
const MAX_WALK_FILES = 100_000;

/** In-memory cache for the latest-release check (per process). */
let releaseCache: { at: number; info: AvailableReleaseInfo } | null = null;

/** Test hook: forget the cached release so the next check refetches. */
export function clearReleaseCache(): void {
  releaseCache = null;
}

/**
 * Parse "1.2.3", "v1.2.3", "1.2" into numeric segments. Prerelease/build
 * suffixes ("-beta.1", "+build") are stripped. Returns null when the
 * leading segments are not numeric.
 */
export function parseVersion(version: string): number[] | null {
  const cleaned = version.trim().replace(/^v/i, '').split('-')[0].split('+')[0];
  if (!cleaned) return null;
  const segments = cleaned.split('.');
  const numbers: number[] = [];
  for (const segment of segments) {
    if (!/^\d+$/.test(segment)) return null;
    numbers.push(parseInt(segment, 10));
  }
  return numbers.length > 0 ? numbers : null;
}

/** Compare two version strings: -1 if a < b, 0 if equal, 1 if a > b, null if either is unparsable. */
export function compareVersions(a: string, b: string): number | null {
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);
  if (!aParts || !bParts) return null;
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i++) {
    const aSeg = aParts[i] ?? 0;
    const bSeg = bParts[i] ?? 0;
    if (aSeg < bSeg) return -1;
    if (aSeg > bSeg) return 1;
  }
  return 0;
}

/**
 * Installed version, read from the backend's own package.json at runtime.
 * Works in Docker (dist/services/system -> ../../../package.json) and in
 * dev/tests (src/services/system -> ../../../package.json). Never hardcoded:
 * if the file can't be read or has no usable version, returns "unknown".
 */
export function getInstalledVersion(): string {
  try {
    const packageJsonPath = path.resolve(__dirname, '..', '..', '..', 'package.json');
    const raw = fs.readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parseVersion(parsed.version)) {
      return parsed.version;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

interface GitHubReleaseResponse {
  tag_name?: unknown;
  body?: unknown;
  html_url?: unknown;
  published_at?: unknown;
}

/**
 * Fetch the latest release from the public GitHub Releases API (no auth).
 * Returns null on any failure: network error, timeout, non-200, bad shape.
 * The URL is a hardcoded constant — no user input, so no SSRF surface.
 */
async function fetchLatestRelease(
  fetchImpl: typeof fetch
): Promise<GitHubReleaseResponse | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RELEASE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(GITHUB_LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'nommable',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GitHubReleaseResponse;
    if (typeof data.tag_name !== 'string') return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Latest-release check with a 1-hour in-memory cache, so opening the admin
 * page never hammers the GitHub API. `fetchImpl` / `now` are injectable
 * for tests; production callers omit both.
 */
export async function getAvailableRelease(
  fetchImpl: typeof fetch = globalThis.fetch,
  now: number = Date.now()
): Promise<AvailableReleaseInfo> {
  const installedVersion = getInstalledVersion();
  const checkedAt = new Date(now).toISOString();

  if (releaseCache && now - releaseCache.at < RELEASE_CACHE_TTL_MS) {
    // Refresh the checkedAt timestamp to the current request, but keep the
    // cached release data (the expensive part is the GitHub fetch).
    return { ...releaseCache.info, checkedAt };
  }

  const release = await fetchLatestRelease(fetchImpl);
  let info: AvailableReleaseInfo;
  if (!release) {
    info = {
      status: 'unavailable',
      version: null,
      releaseNotes: null,
      releaseUrl: null,
      publishedAt: null,
      updateAvailable: false,
      checkedAt,
    };
  } else {
    const version = release.tag_name as string;
    const comparison = compareVersions(installedVersion, version);
    let status: UpdateCheckStatus;
    if (comparison === null) {
      status = 'unknown';
    } else if (comparison < 0) {
      status = 'update-available';
    } else {
      status = 'up-to-date';
    }
    info = {
      status,
      version,
      releaseNotes: typeof release.body === 'string' ? release.body : null,
      releaseUrl: typeof release.html_url === 'string' ? release.html_url : null,
      publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
      updateAvailable: status === 'update-available',
      checkedAt,
    };
  }

  releaseCache = { at: now, info };
  return info;
}

/** File size in bytes, or null when the file can't be statted (missing, :memory:, …). */
export function getFileSizeBytes(filePath: string): number | null {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}

/**
 * Bounded recursive directory size. Skips symlinks (never follows them),
 * caps depth and file count so a pathological uploads tree can't hang the
 * request. Returns null when the directory can't be read at all.
 */
export function getDirectorySizeBytes(
  dirPath: string,
  maxDepth: number = MAX_WALK_DEPTH,
  maxFiles: number = MAX_WALK_FILES
): number | null {
  let total = 0;
  let filesSeen = 0;
  const stack: Array<{ dir: string; depth: number }> = [{ dir: dirPath, depth: 0 }];
  try {
    while (stack.length > 0) {
      const { dir, depth } = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        // A subdirectory that vanishes mid-walk is skipped; a root that
        // can't be listed at all means we know nothing — report null.
        if (depth === 0) return null;
        continue;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (depth + 1 <= maxDepth) stack.push({ dir: full, depth: depth + 1 });
        } else if (entry.isFile()) {
          filesSeen += 1;
          if (filesSeen > maxFiles) return total;
          try {
            total += fs.statSync(full).size;
          } catch {
            // File vanished mid-walk — skip it.
          }
        }
      }
    }
    return total;
  } catch {
    return null;
  }
}

/** Applied vs. known migrations, from the TypeORM migrations table. */
export async function getMigrationStatus(): Promise<SystemStatus['migrations']> {
  const unknown = {
    applied: 0,
    total: 0,
    pending: 0,
    pendingNames: [] as string[],
    status: 'unknown' as const,
  };
  try {
    if (!AppDataSource.isInitialized) return unknown;
    const knownNames = AppDataSource.migrations
      .map((m) => m.name)
      .filter((name): name is string => typeof name === 'string');
    const rows = (await AppDataSource.query('SELECT name FROM migrations')) as Array<{
      name: string;
    }>;
    const appliedNames = new Set(rows.map((r) => r.name));
    const pendingNames = knownNames.filter((name) => !appliedNames.has(name));
    return {
      applied: knownNames.filter((name) => appliedNames.has(name)).length,
      total: knownNames.length,
      pending: pendingNames.length,
      pendingNames,
      status: pendingNames.length === 0 ? 'up-to-date' : 'pending',
    };
  } catch {
    return unknown;
  }
}

/**
 * Assemble the full system status. Each section degrades independently —
 * this never throws, so the admin page can't 500 because GitHub is down
 * or a directory is unreadable.
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  const [available, migrations] = await Promise.all([
    getAvailableRelease(),
    getMigrationStatus(),
  ]);

  return {
    installedVersion: getInstalledVersion(),
    available,
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      path: config.database.path,
      sizeBytes: getFileSizeBytes(config.database.path),
    },
    uploads: {
      path: config.upload.dir,
      sizeBytes: getDirectorySizeBytes(config.upload.dir),
    },
    // Backup/restore is issue #16 (not built yet) — honest empty state.
    lastBackup: {
      status: 'not-configured',
      at: null,
    },
    migrations,
  };
}
