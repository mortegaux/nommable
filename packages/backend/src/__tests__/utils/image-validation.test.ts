/**
 * Negative tests for upload content validation (issue #18).
 * Crafted buffers only — nothing is uploaded to a live service.
 */
import { detectImageType, ALLOWED_MIMES } from '../../utils/image-validation';
import { validateImageContent } from '../../api/middleware/upload';

function mockFile(buffer: Buffer): any {
  return { buffer, originalname: 'upload.jpg', mimetype: 'image/jpeg' };
}

function runValidation(files: any[]): Promise<{ status?: number; message?: string }> {
  return new Promise((resolve) => {
    const req: any = { file: undefined, files };
    const next = (err?: any) => {
      if (err) resolve({ status: err.statusCode, message: err.message });
      else resolve({});
    };
    validateImageContent(req, {} as any, next);
  });
}

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  Buffer.alloc(200, 0),
]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
  Buffer.alloc(200, 0),
]);
const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(200, 0)]);
const webp = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.alloc(4, 0),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(200, 0),
]);
const avif = Buffer.concat([
  Buffer.alloc(4, 0),
  Buffer.from('ftyp', 'ascii'),
  Buffer.from('avif', 'ascii'),
  Buffer.alloc(200, 0),
]);
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  'utf8'
);
const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
const phpShell = Buffer.from('<?php system($_GET["cmd"]); ?>', 'utf8');

describe('detectImageType', () => {
  it.each([
    ['JPEG', jpeg, 'image/jpeg'],
    ['PNG', png, 'image/png'],
    ['GIF', gif, 'image/gif'],
    ['WebP', webp, 'image/webp'],
    ['AVIF', avif, 'image/avif'],
  ])('detects %s', (_name, buf, expected) => {
    expect(detectImageType(buf)).toBe(expected);
  });

  it.each([
    ['SVG with script', svg],
    ['HTML with script', html],
    ['PHP shell', phpShell],
    ['empty', Buffer.alloc(0)],
    ['random bytes', Buffer.alloc(64, 0x41)],
  ])('returns null for %s', (_name, buf) => {
    expect(detectImageType(buf)).toBeNull();
  });
});

describe('ALLOWED_MIMES', () => {
  it('excludes SVG', () => {
    expect(ALLOWED_MIMES.has('image/svg+xml')).toBe(false);
  });
});

describe('validateImageContent', () => {
  it('accepts a real JPEG', async () => {
    await expect(runValidation([mockFile(jpeg)])).resolves.toEqual({});
  });

  it('rejects an SVG file even when it claims to be image/jpeg', async () => {
    const result = await runValidation([mockFile(svg)]);
    expect(result.status).toBe(400);
    expect(result.message).toMatch(/Invalid image file/);
  });

  it('rejects HTML and script content disguised as an image', async () => {
    await expect(runValidation([mockFile(html)])).resolves.toMatchObject({ status: 400 });
    await expect(runValidation([mockFile(phpShell)])).resolves.toMatchObject({ status: 400 });
  });

  it('rejects when any one of several files is malicious (polyglot batch)', async () => {
    const result = await runValidation([mockFile(jpeg), mockFile(svg), mockFile(png)]);
    expect(result.status).toBe(400);
  });
});
