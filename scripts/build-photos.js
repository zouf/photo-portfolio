import { readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import exifr from 'exifr';
import { normalizeExif } from './lib/exif.js';
import { resolveCaption } from './lib/caption.js';
import { readDimensions } from './lib/derivatives.js';
import { albumTitle, validateManifest } from './lib/manifest.js';
import { createLocalTarget } from './lib/targets/local.js';

const STAGING = path.join(os.homedir(), 'Pictures', 'Photo Portfolio Highlights');
const MANIFEST = 'photos.json';

const EXIF_FIELDS = [
  'Model',
  'LensModel',
  'FNumber',
  'ExposureTime',
  'ISO',
  'FocalLength',
  'DateTimeOriginal',
  'ImageDescription',
];

async function loadTarget(name) {
  if (name === 'local') return createLocalTarget();
  if (name === 'firebase') {
    const { createFirebaseTarget } = await import('./lib/targets/firebase.js');
    return createFirebaseTarget();
  }
  throw new Error(`Unknown target "${name}". Use --target=local or --target=firebase.`);
}

async function listAlbums(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
}

async function listPhotos(albumDir) {
  const entries = await readdir(albumDir);
  return entries.filter((f) => /\.jpe?g$/i.test(f) && !f.startsWith('.')).sort();
}

async function buildPhoto(sourcePath, slug, id, target) {
  const raw = await exifr.parse(sourcePath, { pick: EXIF_FIELDS });
  const exif = normalizeExif(raw);
  const { width, height } = await readDimensions(sourcePath);
  const urls = await target.put(sourcePath, slug, id);

  return {
    id,
    ...urls,
    width,
    height,
    caption: resolveCaption({ override: null, exifTitle: raw?.ImageDescription, id }),
    exif,
  };
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--target=')) ?? '--target=local';
  const target = await loadTarget(arg.split('=')[1]);

  await stat(STAGING).catch(() => {
    throw new Error(`Staging folder not found: ${STAGING}`);
  });

  const albums = [];
  const failures = [];

  for (const slug of await listAlbums(STAGING)) {
    const albumDir = path.join(STAGING, slug);
    const photos = [];

    for (const filename of await listPhotos(albumDir)) {
      const id = path.basename(filename, path.extname(filename));
      try {
        photos.push(await buildPhoto(path.join(albumDir, filename), slug, id, target));
        console.log(`  ok   ${slug}/${id}`);
      } catch (err) {
        // Keep going — one unreadable file shouldn't sink the whole batch.
        failures.push(`${slug}/${id}: ${err.message}`);
        console.error(`  FAIL ${slug}/${id}: ${err.message}`);
      }
    }

    albums.push({ slug, title: albumTitle(slug), photos });
  }

  // A partial manifest would silently drop photos from the site, which is worse
  // than no manifest at all — so write nothing unless every photo succeeded.
  if (failures.length > 0) {
    console.error(`\n${failures.length} photo(s) failed; ${MANIFEST} not written.`);
    process.exit(1);
  }

  const manifest = { albums };
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    console.error('\nManifest failed validation:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  const count = albums.reduce((n, a) => n + a.photos.length, 0);
  console.log(`\nWrote ${MANIFEST}: ${albums.length} albums, ${count} photos (target: ${target.name})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
