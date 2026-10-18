import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseVersion,
  compareVersions,
  getInstalledVersion,
  getAvailableRelease,
  clearReleaseCache,
  getFileSizeBytes,
  getDirectorySizeBytes,
  getMigrationStatus,
} from '../../services/system/system-status.service';

describe('parseVersion', () => {
  it('parses plain and v-prefixed versions', () => {
    expect(parseVersion('1.1.0')).toEqual([1, 1, 0]);
    expect(parseVersion('v2.0.1')).toEqual([2, 0, 1]);
    expect(parseVersion('1.2')).toEqual([1, 2]);
    expect(parseVersion('10.20.30')).toEqual([10, 20, 30]);
  });

  it('strips prerelease/build suffixes', () => {
    expect(parseVersion('1.1.0-beta.1')).toEqual([1, 1, 0]);
    expect(parseVersion('1.1.0+build.5')).toEqual([1, 1, 0]);
  });

  it('returns null for non-numeric versions', () => {
    expect(parseVersion('unknown')).toBeNull();
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('1.x.0')).toBeNull();
    expect(parseVersion('1.2.3.4.5.6.7.8.9a')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('orders versions numerically, not lexicographically', () => {
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.1.0')).toBe(0);
    expect(compareVersions('v1.1.0', '1.1.0')).toBe(0);
    expect(compareVersions('1.1', '1.1.0')).toBe(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('returns null when either side is unparsable', () => {
    expect(compareVersions('unknown', '1.0.0')).toBeNull();
    expect(compareVersions('1.0.0', 'unknown')).toBeNull();
  });
});

describe('getInstalledVersion', () => {
  it('reads the backend package.json version (never hardcoded)', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8')
    ) as { version: string };
    expect(getInstalledVersion()).toBe(pkg.version);
    expect(getInstalledVersion()).not.toBe('unknown');
  });
});

function mockReleaseFetch(tag: string) {
  return jest.fn(async () =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        tag_name: tag,
        body: '## Changes\n- thing',
        html_url: `https://github.com/mortegaux/nommable/releases/tag/${tag}`,
        published_at: '2026-10-17T00:00:00Z',
      }),
    })
  ) as unknown as typeof fetch;
}

describe('getAvailableRelease', () => {
  beforeEach(() => {
    clearReleaseCache();
  });

  it('reports update-available when the release is newer than installed', async () => {
    const fetchMock = mockReleaseFetch('v99.0.0');
    const info = await getAvailableRelease(fetchMock, 1_000_000);
    expect(info.status).toBe('update-available');
    expect(info.updateAvailable).toBe(true);
    expect(info.version).toBe('v99.0.0');
    expect(info.releaseNotes).toContain('## Changes');
    expect(info.releaseUrl).toContain('v99.0.0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports up-to-date when installed matches the release', async () => {
    const installed = getInstalledVersion();
    const fetchMock = mockReleaseFetch(`v${installed}`);
    const info = await getAvailableRelease(fetchMock, 1_000_000);
    expect(info.status).toBe('up-to-date');
    expect(info.updateAvailable).toBe(false);
  });

  it('caches for an hour: a second call within the TTL does not refetch', async () => {
    const fetchMock = mockReleaseFetch('v99.0.0');
    await getAvailableRelease(fetchMock, 1_000_000);
    await getAvailableRelease(fetchMock, 1_000_000 + 30 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches after the TTL expires', async () => {
    const fetchMock = mockReleaseFetch('v99.0.0');
    await getAvailableRelease(fetchMock, 1_000_000);
    await getAvailableRelease(fetchMock, 1_000_000 + 61 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('degrades to unavailable when GitHub is unreachable — never throws', async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const info = await getAvailableRelease(fetchMock, 1_000_000);
    expect(info.status).toBe('unavailable');
    expect(info.version).toBeNull();
    expect(info.updateAvailable).toBe(false);
  });

  it('degrades to unavailable on a non-200 response', async () => {
    const fetchMock = jest.fn(async () =>
      Promise.resolve({ ok: false, status: 403 })
    ) as unknown as typeof fetch;
    const info = await getAvailableRelease(fetchMock, 1_000_000);
    expect(info.status).toBe('unavailable');
  });
});

describe('getFileSizeBytes / getDirectorySizeBytes', () => {
  it('stats a real file and returns null for a missing one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-size-'));
    const file = path.join(dir, 'a.txt');
    fs.writeFileSync(file, 'hello');
    expect(getFileSizeBytes(file)).toBe(5);
    expect(getFileSizeBytes(path.join(dir, 'missing.db'))).toBeNull();
    expect(getFileSizeBytes(':memory:')).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sums a directory recursively and skips symlinks', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-dir-'));
    const sub = path.join(dir, 'sub');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(dir, 'a.txt'), '12345');
    fs.writeFileSync(path.join(sub, 'b.txt'), '1234567');
    fs.symlinkSync(path.join(dir, 'a.txt'), path.join(dir, 'link.txt'));
    expect(getDirectorySizeBytes(dir)).toBe(12);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a nonexistent directory', () => {
    expect(getDirectorySizeBytes(path.join(os.tmpdir(), 'nommable-nope-xyz'))).toBeNull();
  });
});

describe('getMigrationStatus', () => {
  it('reports the known migrations as applied (test DB runs migrations on init)', async () => {
    const status = await getMigrationStatus();
    expect(status.total).toBeGreaterThanOrEqual(1);
    expect(status.applied).toBe(status.total);
    expect(status.pending).toBe(0);
    expect(status.pendingNames).toEqual([]);
    expect(status.status).toBe('up-to-date');
  });
});
