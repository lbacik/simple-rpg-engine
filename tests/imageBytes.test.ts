// Image-byte inspection tests: format detection by signature and intrinsic
// dimensions for PNG, JPEG and WebP (see docs/spec/scenario-format.md,
// Images). Hand-crafted headers only; no decoder dependency.

import { describe, expect, it } from 'vitest';
import { inspectImage } from '../src/content/images';

function pngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(8 + 8 + 13);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

function jpegWithSof(width: number, height: number): Buffer {
  const app0 = Buffer.alloc(2 + 2 + 14, 0);
  app0[0] = 0xff;
  app0[1] = 0xe0;
  app0.writeUInt16BE(16, 2);
  const sof0 = Buffer.alloc(2 + 2 + 1 + 2 + 2 + 1 + 3 * 3, 0);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(2 + 1 + 2 + 2 + 1 + 9, 2);
  sof0[4] = 8;
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0]);
}

function webpChunk(fourcc: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + 8 + payload.length, 4);
  header.write('WEBP', 8, 'ascii');
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.write(fourcc, 0, 'ascii');
  chunkHeader.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, chunkHeader, payload]);
}

describe('inspectImage', () => {
  it('reads PNG dimensions', () => {
    expect(inspectImage(pngHeader(640, 360))).toEqual({ format: 'png', width: 640, height: 360 });
  });

  it('reads JPEG dimensions from the SOF marker', () => {
    expect(inspectImage(jpegWithSof(5, 7))).toEqual({ format: 'jpeg', width: 5, height: 7 });
  });

  it('reads lossy WebP (VP8) dimensions', () => {
    const payload = Buffer.from([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x09, 0x00, 0x04, 0x00]);
    expect(inspectImage(webpChunk('VP8 ', payload))).toEqual({ format: 'webp', width: 9, height: 4 });
  });

  it('reads lossless WebP (VP8L) dimensions', () => {
    // 0x2f signature, then (w-1) and (h-1) packed: w=10, h=6.
    const payload = Buffer.from([0x2f, 0x09, 0x40, 0x01, 0x00]);
    expect(inspectImage(webpChunk('VP8L', payload))).toEqual({ format: 'webp', width: 10, height: 6 });
  });

  it('reads extended WebP (VP8X) dimensions', () => {
    // Flags, three reserved bytes, then w-1 = 299, h-1 = 199 as 24-bit
    // little-endian.
    const payload = Buffer.from([0x10, 0x00, 0x00, 0x00, 0x2b, 0x01, 0x00, 0xc7, 0x00, 0x00]);
    expect(inspectImage(webpChunk('VP8X', payload))).toEqual({
      format: 'webp',
      width: 300,
      height: 200,
    });
  });

  it('returns undefined for non-image bytes', () => {
    expect(inspectImage(Buffer.from('hello, woods', 'utf8'))).toBeUndefined();
  });

  it('detects the format even when dimensions are unreachable', () => {
    expect(inspectImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toEqual({
      format: 'png',
      width: undefined,
      height: undefined,
    });
  });
});
