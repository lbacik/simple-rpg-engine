// Scenario assets (docs/spec/architecture.md, scenario assets): the only Route
// Handler. It serves only paths declared by the loaded Scenario, read from the
// Scenario directory at request time, when the hash matches the registry
// entry. Anything else is a 404. No Session is required.
//
// Relative imports keep this module loadable outside Next.js (unit tests).

import fs from 'node:fs';
import path from 'node:path';
import { getScenario } from '../../../../../../content/registry';
import { hasDotDot, isAbsolutePath, isUrl } from '../../../../../../content/paths';
import type { ImageFormat } from '../../../../../../content/images';

export const dynamic = 'force-dynamic';

const CONTENT_TYPE_BY_FORMAT: Readonly<Record<ImageFormat, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

type AssetParams = {
  scenarioId: string;
  hash: string;
  path: string[];
};

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

/**
 * Serve one declared Scenario image or Motion Layer file. The bytes come from
 * the Scenario directory on every request, so a file deleted after startup is
 * a 404 and the browser drops the image without breaking the Scene. Each file
 * is served under its own registry hash: a Still under the image hash, a Layer
 * file under its Layer hash (docs/spec/architecture.md, scenario assets).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<AssetParams> },
): Promise<Response> {
  const { scenarioId, hash, path: parts } = await context.params;
  const scenario = getScenario(scenarioId);
  if (scenario === undefined) return notFound();
  const relative = (parts ?? []).join('/');
  if (relative === '' || isAbsolutePath(relative) || isUrl(relative) || hasDotDot(relative)) {
    return notFound();
  }
  const still = scenario.images.find((entry) => entry.path === relative);
  // A Layer file is not a catalog entry: one file may serve several Layers
  // and several Illustrations, so it is found through every image's Motion.
  const layer =
    still === undefined
      ? scenario.images
          .flatMap((entry) => entry.motion?.layers.map((layerEntry) => layerEntry.file) ?? [])
          .find((file) => file.path === relative)
      : undefined;
  const image = still ?? layer;
  if (image === undefined || image.hash !== hash) return notFound();
  const dir = path.resolve(scenario.dir);
  const full = path.resolve(dir, relative);
  if (full !== dir && !full.startsWith(`${dir}${path.sep}`)) return notFound();
  let bytes: Buffer;
  try {
    if (!fs.statSync(full).isFile()) return notFound();
    // A symlink swapped in after startup must not escape the Scenario directory.
    const real = fs.realpathSync(full);
    if (real !== dir && !real.startsWith(`${dir}${path.sep}`)) return notFound();
    bytes = fs.readFileSync(full);
  } catch {
    return notFound();
  }
  // A fresh ArrayBuffer satisfies the DOM BodyInit type, which a Buffer slice
  // (backed by ArrayBufferLike) does not.
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPE_BY_FORMAT[image.format],
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
