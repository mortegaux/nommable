/**
 * Tests for the processImage WebP fallback.
 * The deployed canvas build cannot decode WebP (loadImage throws
 * "Unsupported image type"), which used to reject valid WebP pantry
 * photos even though the scan dialog advertises WebP. The canvas
 * module is mocked to reproduce that build: it throws for WebP/AVIF
 * buffers and succeeds for everything else. Crafted buffers only —
 * nothing is uploaded to a live service.
 */
import { loadImage } from 'canvas';
import { processImage } from '../../utils/image-processor';

jest.mock('canvas', () => ({
  loadImage: jest.fn(),
}));

const mockedLoadImage = loadImage as unknown as jest.Mock;

const webp = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.alloc(4, 0),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(200, 0),
]);
const avif = Buffer.concat([
  Buffer.alloc(4, 0),
  Buffer.from('ftypavif', 'ascii'),
  Buffer.alloc(200, 0),
]);
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  Buffer.alloc(200, 0),
]);
const garbage = Buffer.from('this is not an image at all, just text', 'utf8');

beforeEach(() => {
  mockedLoadImage.mockReset();
  // Simulate the deployed canvas build: only JPEG-like buffers load;
  // WebP/AVIF and non-images all throw "Unsupported image type".
  mockedLoadImage.mockImplementation((buf: Buffer) => {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return Promise.resolve({} as any);
    }
    return Promise.reject(new Error('Unsupported image type'));
  });
});

describe('processImage', () => {
  it('passes a valid WebP through when canvas cannot decode it', async () => {
    const result = await processImage(webp, 'image/webp');
    expect(result.data).toBe(webp);
    expect(result.mimeType).toBe('image/webp');
  });

  it('passes a valid AVIF through when canvas cannot decode it', async () => {
    const result = await processImage(avif, 'image/avif');
    expect(result.data).toBe(avif);
    expect(result.mimeType).toBe('image/avif');
  });

  it('keeps the original behavior for images canvas can load', async () => {
    const result = await processImage(jpeg, 'image/jpeg');
    expect(result.data).toBe(jpeg);
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('still rejects non-images instead of rescuing them', async () => {
    await expect(processImage(garbage, 'image/jpeg')).rejects.toThrow(
      'Invalid image file: Unsupported image type'
    );
  });

  it('still rejects a corrupt JPEG canvas refuses', async () => {
    mockedLoadImage.mockRejectedValueOnce(new Error('Unsupported image type'));
    // JPEG magic bytes but canvas refuses: detected type is image/jpeg,
    // which is NOT in the canvas-unsupported set, so it must still fail.
    await expect(processImage(jpeg, 'image/jpeg')).rejects.toThrow('Invalid image file');
  });
});
