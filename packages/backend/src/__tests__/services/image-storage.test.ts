/**
 * Tests for server-side image downloads and saves (issue #18).
 *
 * HTTP and DNS are mocked: no test fetches a real URL, internal or otherwise.
 * Blocking is verified by the guard's decision and by what was (not) fetched.
 */
import dns from 'dns';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from '../../config';
import { AppDataSource } from '../../db/data-source';
import { ImageStorageService } from '../../services/image-storage.service';

jest.mock('dns', () => ({
  promises: { lookup: jest.fn() },
}));
jest.mock('axios');

const mockedLookup = dns.promises.lookup as unknown as jest.Mock;
const mockedGet = axios.get as unknown as jest.Mock;

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  Buffer.alloc(200, 0),
]);
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  'utf8'
);

let tmpUploadDir: string;

beforeEach(() => {
  jest.clearAllMocks();
  mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  tmpUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nommable-img-'));
  config.upload.dir = tmpUploadDir;
});

afterEach(() => {
  fs.rmSync(tmpUploadDir, { recursive: true, force: true });
});

describe('localizeExternalImage', () => {
  it('downloads a public image and stores it locally', async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      data: jpeg,
    });
    const result = await ImageStorageService.localizeExternalImage('https://example.com/pic.jpg');
    expect(result).toMatch(/^\/uploads\/recipes\/recipe-.*\.jpg$/);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('refuses an SVG response and keeps the original URL (stored-XSS defense)', async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
      data: svg,
    });
    const url = 'https://example.com/evil.svg';
    // Row count before/after: initialize() syncs pre-existing disk images
    // into stored_images, so assert the SVG added nothing rather than
    // asserting an empty table.
    const before = await AppDataSource.query('SELECT COUNT(*) AS n FROM "stored_images"');
    await expect(ImageStorageService.localizeExternalImage(url)).resolves.toBe(url);
    const after = await AppDataSource.query('SELECT COUNT(*) AS n FROM "stored_images"');
    expect(after[0].n).toBe(before[0].n);
  });

  it('refuses SVG bytes behind an image/jpeg content type (magic-byte check)', async () => {
    mockedGet.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
      data: Buffer.concat([svg, Buffer.alloc(200, 0)]),
    });
    const url = 'https://example.com/fake.jpg';
    await expect(ImageStorageService.localizeExternalImage(url)).resolves.toBe(url);
  });

  it('never fetches an internal address, even via a redirect', async () => {
    mockedGet.mockResolvedValueOnce({
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      data: '',
    });
    const url = 'https://example.com/redirect.jpg';
    await expect(ImageStorageService.localizeExternalImage(url)).resolves.toBe(url);
    // Only the initial public URL was requested; the internal hop was blocked.
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('never fetches a literal internal URL', async () => {
    const url = 'http://127.0.0.1/admin/secret.png';
    await expect(ImageStorageService.localizeExternalImage(url)).resolves.toBe(url);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('passes non-http(s) URLs through untouched', async () => {
    await expect(
      ImageStorageService.localizeExternalImage('data:image/png;base64,abc')
    ).resolves.toBe('data:image/png;base64,abc');
    expect(mockedGet).not.toHaveBeenCalled();
  });
});

describe('saveImageBuffer', () => {
  it('stores the detected type, not a caller-supplied MIME', async () => {
    const { imageUrl, filePath } = await ImageStorageService.saveImageBuffer(
      'recipes',
      jpeg,
      'image/svg+xml',
      'recipe'
    );
    expect(imageUrl).toMatch(/\.jpg$/);
    expect(fs.existsSync(filePath)).toBe(true);
    const rows = await AppDataSource.query(
      'SELECT "mime_type" FROM "stored_images" WHERE "file_path" = ?',
      [imageUrl.replace('/uploads/', '')]
    );
    expect(rows[0].mime_type).toBe('image/jpeg');
  });

  it('rejects SVG content', async () => {
    await expect(
      ImageStorageService.saveImageBuffer('recipes', svg, 'image/svg+xml', 'recipe')
    ).rejects.toThrow(/Unsupported image content/);
  });
});
