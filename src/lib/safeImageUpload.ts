import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export interface ImageUploadResult {
  success: boolean;
  url?: string;
  filename?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Validates base64 image data against strict size limits and binary magic bytes signatures.
 * Strictly derives extension from binary magic bytes (never trusting user MIME or filename).
 * Prevents stored XSS, HTML/SVG execution, and unvalidated file upload vulnerabilities.
 */
export async function saveBase64Image(
  dataUri: string,
  subDirectory: string = 'uploads',
  filenamePrefix: string = 'img',
  maxBytes: number = 5 * 1024 * 1024 // 5MB limit
): Promise<ImageUploadResult> {
  if (!dataUri || typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) {
    return { success: false, error: 'Invalid or missing image data URI.', statusCode: 400 };
  }

  const matches = dataUri.match(/^data:image\/[A-Za-z0-9+.-]+;base64,(.+)$/);
  if (!matches || matches.length !== 2) {
    return { success: false, error: 'Malformed base64 image data.', statusCode: 400 };
  }

  const base64Data = matches[1];
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch (err) {
    return { success: false, error: 'Invalid base64 encoding.', statusCode: 400 };
  }

  if (buffer.length === 0) {
    return { success: false, error: 'Empty image buffer.', statusCode: 400 };
  }

  if (buffer.length > maxBytes) {
    return {
      success: false,
      error: `Image exceeds maximum allowed size of ${(maxBytes / (1024 * 1024)).toFixed(0)}MB.`,
      statusCode: 400,
    };
  }

  // Magic Bytes Validation (JPEG, PNG, WebP, GIF)
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;

  const isJpg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isWebp =
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;

  const isGif =
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38;

  if (!isPng && !isJpg && !isWebp && !isGif) {
    return {
      success: false,
      error: 'Invalid file format. Only JPG, PNG, WEBP, and GIF images are permitted.',
      statusCode: 400,
    };
  }

  const ext = isPng ? 'png' : isWebp ? 'webp' : isGif ? 'gif' : 'jpg';
  const randomKey = crypto.randomBytes(16).toString('hex');
  const safePrefix = filenamePrefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const filename = `${safePrefix}_${Date.now()}_${randomKey}.${ext}`;

  // Target directories: public/<subDirectory>
  const primaryDir = path.join(process.cwd(), 'public', subDirectory);
  await fs.mkdir(primaryDir, { recursive: true });
  await fs.writeFile(path.join(primaryDir, filename), buffer);

  const relativeUrl = `/${subDirectory.replace(/\\/g, '/')}/${filename}`.replace(/\/+/g, '/');

  return {
    success: true,
    url: relativeUrl,
    filename,
  };
}
