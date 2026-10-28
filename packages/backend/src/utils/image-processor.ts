import { loadImage } from 'canvas';
import { detectImageType } from './image-validation';

export interface ProcessedImage {
  data: Buffer;
  mimeType: string;
}

/**
 * Formats node-canvas cannot decode, even though they are valid images
 * the AI providers accept natively. Canvas's loader only handles a
 * subset (JPEG/PNG/GIF in the deployed build) and throws "Unsupported
 * image type" for the rest — which used to surface to users as
 * "Invalid image file: Unsupported image type" for perfectly valid
 * WebP pantry photos, even though the scan dialog advertises WebP.
 * Keep this list to formats the providers accept (Google, OpenAI and
 * Anthropic all take WebP; see their scanPantryFromImages implementations).
 */
const CANVAS_UNSUPPORTED_MIMES = new Set(['image/webp', 'image/avif']);

/**
 * Validate and process uploaded image.
 *
 * Primary path is unchanged: the image must load in canvas, and the
 * original bytes + client MIME pass through. Fallback: when canvas
 * refuses a file, check the content's magic bytes — if they prove the
 * file is a canvas-unsupported but provider-accepted format (WebP,
 * AVIF), pass the original bytes through with the detected MIME
 * instead of failing. This mirrors the HEIC/HEIF canvas skip already
 * in the pantry-scan and recipe-photo controllers (canvas can't decode
 * those either, and providers handle them directly).
 *
 * Anything else still fails exactly as before, so corrupt files and
 * non-images are still rejected — a corrupt JPEG/PNG/GIF, for example,
 * is not rescued by this fallback because its detected type is not in
 * CANVAS_UNSUPPORTED_MIMES.
 */
export async function processImage(imageBuffer: Buffer, mimeType: string): Promise<ProcessedImage> {
  // Validate image by attempting to load it
  try {
    await loadImage(imageBuffer);
    return {
      data: imageBuffer,
      mimeType,
    };
  } catch (error: any) {
    const detected = detectImageType(imageBuffer);
    if (detected && CANVAS_UNSUPPORTED_MIMES.has(detected)) {
      return {
        data: imageBuffer,
        mimeType: detected,
      };
    }
    throw new Error(`Invalid image file: ${error.message}`);
  }
}
