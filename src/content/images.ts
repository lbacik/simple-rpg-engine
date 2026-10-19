// Image-byte inspection for the Integrity phase (docs/spec/scenario-format.md,
// Images; docs/spec/validation.md, codes ref/image-*).
//
// Format detection reads the file signature; dimensions come from the image
// headers directly, so no decoder dependency is needed. Supported formats are
// PNG, JPEG and WebP; the extension mapping (lowercase `.png`, `.jpg`/`.jpeg`,
// `.webp`) lives here too, next to the size limits.

import { createHash } from 'node:crypto';

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export type InspectedImage = {
  format: ImageFormat;
  width: number | undefined;
  height: number | undefined;
};

/** Supported image extensions (lowercase) to their detected format. */
export const IMAGE_FORMAT_BY_EXTENSION: Readonly<Record<string, ImageFormat>> = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.webp': 'webp',
};

/** Image files must be at most 2 MiB with no side over 4096 px. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 4096;

/**
 * An Illustration's Still plus every distinct Layer file of its Motion must
 * total at most 4 MiB (docs/spec/scenario-format.md, Images). A file shared
 * by several Layers of one Illustration counts once; shared with another
 * Illustration, it counts in each.
 */
export const MAX_ILLUSTRATION_BYTES = 4 * 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SOI = Buffer.from([0xff, 0xd8]);

function pngDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  // Width and height are the first eight bytes of the IHDR data, which
  // follows the 8-byte signature, the 4-byte length and the `IHDR` type.
  if (bytes.length < 8 + 8 + 8) return undefined;
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return undefined;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  // Walk the marker segments after SOI until a Start-Of-Frame marker carries
  // the dimensions. Standalone markers (RSTn, TEM, SOI, EOI) have no length.
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1] as number;
    if (marker === 0xd9 || marker === 0xda) return undefined; // EOI, or scan data
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) return undefined;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return undefined;
    const isSof =
      (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc);
    if (isSof) {
      if (length < 7) return undefined;
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return undefined;
}

function webpDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  // RIFF size WEBP, then one chunk: `VP8 ` (lossy), `VP8L` (lossless) or
  // `VP8X` (extended).
  if (bytes.length < 12 + 8) return undefined;
  if (bytes.subarray(0, 4).toString('ascii') !== 'RIFF') return undefined;
  if (bytes.subarray(8, 12).toString('ascii') !== 'WEBP') return undefined;
  const fourcc = bytes.subarray(12, 16).toString('ascii');
  const payload = bytes.subarray(20);
  if (fourcc === 'VP8 ') {
    if (payload.length < 10) return undefined;
    if (payload[3] !== 0x9d || payload[4] !== 0x01 || payload[5] !== 0x2a) return undefined;
    return { width: payload.readUInt16LE(6) & 0x3fff, height: payload.readUInt16LE(8) & 0x3fff };
  }
  if (fourcc === 'VP8L') {
    if (payload.length < 5 || payload[0] !== 0x2f) return undefined;
    const bits = payload.readUInt32LE(1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (fourcc === 'VP8X') {
    // One flags byte, three reserved bytes, then the canvas width and
    // height minus one as 24-bit little-endian values.
    if (payload.length < 10) return undefined;
    return {
      width: payload.readUIntLE(4, 3) + 1,
      height: payload.readUIntLE(7, 3) + 1,
    };
  }
  return undefined;
}

/**
 * Identify an image by its signature and read its intrinsic dimensions.
 * Returns undefined when the bytes carry no supported image signature; when
 * the signature is known but the dimensions are unreachable, the format is
 * still reported with undefined sides.
 *
 * Every present byte must match the signature (a truncated file still names
 * its format).
 */
function matchesSignaturePrefix(bytes: Buffer, signature: Buffer): boolean {
  if (bytes.length === 0) return false;
  const length = Math.min(bytes.length, signature.length);
  return bytes.subarray(0, length).equals(signature.subarray(0, length));
}

export function inspectImage(bytes: Buffer): InspectedImage | undefined {
  if (matchesSignaturePrefix(bytes, PNG_SIGNATURE)) {
    const dimensions = pngDimensions(bytes);
    return { format: 'png', width: dimensions?.width, height: dimensions?.height };
  }
  if (bytes.length >= 3 && bytes.subarray(0, 2).equals(JPEG_SOI) && bytes[2] === 0xff) {
    const dimensions = jpegDimensions(bytes);
    return { format: 'jpeg', width: dimensions?.width, height: dimensions?.height };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const dimensions = webpDimensions(bytes);
    return { format: 'webp', width: dimensions?.width, height: dimensions?.height };
  }
  return undefined;
}

/** The deterministic hash of an image's bytes for the registry and content hash. */
export function hashImageBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
