/**
 * Shared image-type validation: the strict MIME allowlist, the
 * extension map, and magic-byte content detection.
 *
 * Used by the upload middleware (client-supplied MIME + content check) and
 * by image storage (server-side downloads and saves), so every path that
 * stores an image agrees on what an image is.
 *
 * SVG is deliberately excluded: SVGs can embed JavaScript and would be
 * served from the app's origin, turning an upload into stored XSS.
 * AVIF is included: it is a raster format like WebP/HEIC with no script
 * capability.
 */
export const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
]);

export const EXTRACTION_ALLOWED_MIMES = new Set([
  ...ALLOWED_MIMES,
  'image/heic-sequence',
  'image/heif-sequence',
]);

// Map validated MIME types to file extensions
export const mimeToExt: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/heic-sequence': '.heic',
  'image/heif-sequence': '.heif',
};

/**
 * Detect the real image type from magic bytes. Returns the MIME type or null.
 * This is defense-in-depth on top of any client-supplied MIME type, which can
 * be spoofed. SVG/HTML/script content has no recognized magic bytes here and
 * returns null, so it is rejected wherever this check runs.
 */
export function detectImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  // GIF: GIF87a / GIF89a
  const head6 = buf.subarray(0, 6).toString('ascii');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  // HEIC/HEIF/AVIF: ....ftyp + brand
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (
      ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(
        brand
      )
    ) {
      return 'image/heic';
    }
    if (['avif', 'avis'].includes(brand)) {
      return 'image/avif';
    }
  }
  return null;
}
