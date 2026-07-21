# Photo Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static photo portfolio at `zouf.photo` — a masonry gallery of 17 photos across 3 albums, with a lightbox showing captions and EXIF.

**Architecture:** A local Node pipeline reads JPEGs from a staging folder, extracts EXIF, generates three derivative sizes with `sharp`, and writes a small `photos.json` manifest. An Astro site builds entirely from that manifest. Image bytes go to Firebase Storage; only the manifest enters git. The pipeline has two targets — `local` (derivatives to `public/photos/`, for development before any cloud account exists) and `firebase` (upload to Storage) — so the site is buildable and viewable immediately.

**Tech Stack:** Astro 5, `sharp` (derivatives), `exifr` (EXIF), `firebase-admin` (Storage upload), `node:test` (tests, no test framework dependency).

---

## File Structure

```
photo-portfolio/
├── scripts/
│   ├── lib/
│   │   ├── exif.js          # read EXIF → normalized metadata object
│   │   ├── caption.js       # caption resolution order
│   │   ├── derivatives.js   # sharp resize math + generation
│   │   ├── manifest.js      # manifest build + schema validation
│   │   └── targets/
│   │       ├── local.js     # write derivatives to public/photos/
│   │       └── firebase.js  # upload derivatives to Storage
│   └── build-photos.js      # CLI entry: orchestrates the above
├── src/
│   ├── layouts/Base.astro   # html shell, theme CSS, header/footer
│   ├── components/
│   │   ├── MasonryGrid.astro
│   │   └── Lightbox.astro
│   ├── pages/
│   │   ├── index.astro          # all albums
│   │   ├── albums/[slug].astro  # one album
│   │   └── about.astro
│   └── styles/theme.css     # warm neutral tokens
├── photos.json              # manifest — the only image data in git
├── firebase.json
└── tests/                   # mirrors scripts/lib/
```

Each `scripts/lib/` module is pure and independently testable: it takes data in and returns data out. Only `targets/` and `build-photos.js` touch the filesystem or network. This is what makes the logic testable without a Firebase account.

**Staging source:** `~/Pictures/Photo Portfolio Highlights/{arizona,budapest,stoney-lake}/`

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`

- [ ] **Step 1: Initialize the project**

```bash
cd /Users/zouf/code/photo-portfolio
npm init -y
npm install astro@^5
npm install sharp exifr firebase-admin
```

- [ ] **Step 2: Write `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://zouf.photo',
  output: 'static',
});
```

- [ ] **Step 3: Set scripts in `package.json`**

Replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "test": "node --test tests/",
  "photos:local": "node scripts/build-photos.js --target=local",
  "photos:upload": "node scripts/build-photos.js --target=firebase"
},
"type": "module"
```

- [ ] **Step 4: Verify Astro runs**

Run: `npx astro --version`
Expected: prints a 5.x version number.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json
git commit -m "Scaffold Astro project"
```

---

### Task 2: EXIF extraction

Normalizes messy EXIF into the flat shape the manifest and lightbox use. Every field is optional — cameras and export settings vary, and the site must render whatever is present.

**Files:**
- Create: `scripts/lib/exif.js`
- Test: `tests/exif.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/exif.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExif } from '../scripts/lib/exif.js';

test('normalizes a full EXIF record', () => {
  const raw = {
    Model: 'NIKON Z5_2',
    LensModel: 'NIKKOR Z 24-70mm f/4 S',
    FNumber: 2.8,
    ExposureTime: 0.002,
    ISO: 100,
    FocalLength: 35,
    DateTimeOriginal: new Date('2026-04-05T18:59:08'),
  };
  assert.deepEqual(normalizeExif(raw), {
    camera: 'NIKON Z5 II',
    lens: 'NIKKOR Z 24-70mm f/4 S',
    aperture: 'f/2.8',
    shutter: '1/500',
    iso: 100,
    focalLength: '35mm',
    capturedAt: '2026-04-05T18:59:08',
  });
});

test('omits fields that are absent', () => {
  assert.deepEqual(normalizeExif({ Model: 'NIKON Z50_2' }), {
    camera: 'NIKON Z50 II',
  });
});

test('returns an empty object when there is no EXIF at all', () => {
  assert.deepEqual(normalizeExif({}), {});
  assert.deepEqual(normalizeExif(null), {});
});

test('formats slow shutter speeds as seconds', () => {
  assert.equal(normalizeExif({ ExposureTime: 2 }).shutter, '2s');
  assert.equal(normalizeExif({ ExposureTime: 0.5 }).shutter, '1/2');
});
```

Note the camera renaming: Nikon writes `Z5_2` and `Z50_2` in EXIF, which are the Z5 II and Z50 II. Displaying the raw value would look like a bug.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/exif.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/exif.js'`

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/exif.js

// Nikon writes model names like "Z5_2" meaning "Z5 II".
function formatCamera(model) {
  return model.replace(/^(NIKON Z\d+)_2$/, '$1 II');
}

function formatShutter(seconds) {
  if (seconds >= 1) return `${seconds}s`;
  return `1/${Math.round(1 / seconds)}`;
}

export function normalizeExif(raw) {
  if (!raw) return {};
  const out = {};
  if (raw.Model) out.camera = formatCamera(raw.Model);
  if (raw.LensModel) out.lens = raw.LensModel;
  if (raw.FNumber) out.aperture = `f/${raw.FNumber}`;
  if (raw.ExposureTime) out.shutter = formatShutter(raw.ExposureTime);
  if (raw.ISO) out.iso = raw.ISO;
  if (raw.FocalLength) out.focalLength = `${Math.round(raw.FocalLength)}mm`;
  if (raw.DateTimeOriginal) {
    const d = raw.DateTimeOriginal;
    out.capturedAt = (d instanceof Date ? d : new Date(d))
      .toISOString()
      .replace(/\.\d{3}Z$/, '');
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/exif.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/exif.js tests/exif.test.js
git commit -m "Add EXIF normalization"
```

---

### Task 3: Caption resolution

**Files:**
- Create: `scripts/lib/caption.js`
- Test: `tests/caption.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/caption.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCaption } from '../scripts/lib/caption.js';

test('an explicit override wins over everything', () => {
  assert.equal(
    resolveCaption({ override: 'Golden hour', exifTitle: 'DSC_1486', id: 'DSC_1486' }),
    'Golden hour'
  );
});

test('falls back to the EXIF title', () => {
  assert.equal(
    resolveCaption({ override: null, exifTitle: 'Superstition Ridge', id: 'DSC_1486' }),
    'Superstition Ridge'
  );
});

test('returns null rather than showing a filename', () => {
  assert.equal(resolveCaption({ override: null, exifTitle: null, id: 'DSC_1486' }), null);
});

test('ignores an EXIF title that is just the filename', () => {
  assert.equal(
    resolveCaption({ override: null, exifTitle: 'DSC_1486', id: 'DSC_1486' }),
    null
  );
});

test('ignores blank and whitespace-only values', () => {
  assert.equal(resolveCaption({ override: '   ', exifTitle: '', id: 'DSC_1486' }), null);
});
```

The filename check matters: Lightroom sometimes writes the filename into the title field, and `DSC_1486` as a caption looks broken.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/caption.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/caption.js

function clean(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveCaption({ override, exifTitle, id }) {
  const explicit = clean(override);
  if (explicit) return explicit;

  const title = clean(exifTitle);
  if (title && title !== id) return title;

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/caption.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/caption.js tests/caption.test.js
git commit -m "Add caption resolution"
```

---

### Task 4: Derivative sizing

Pure sizing math, separated from `sharp` so it can be tested without touching image files.

**Files:**
- Create: `scripts/lib/derivatives.js`
- Test: `tests/derivatives.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/derivatives.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZES, targetDimensions } from '../scripts/lib/derivatives.js';

test('scales a landscape photo by its long edge', () => {
  assert.deepEqual(targetDimensions(6048, 4032, 600), { width: 600, height: 400 });
});

test('scales a portrait photo by its long edge', () => {
  assert.deepEqual(targetDimensions(4032, 6048, 600), { width: 400, height: 600 });
});

test('never upscales a photo smaller than the target', () => {
  assert.deepEqual(targetDimensions(400, 300, 600), { width: 400, height: 300 });
});

test('defines thumb and med sizes', () => {
  assert.equal(SIZES.thumb, 600);
  assert.equal(SIZES.med, 2400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/derivatives.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/derivatives.js
import sharp from 'sharp';

export const SIZES = { thumb: 600, med: 2400 };

export function targetDimensions(width, height, longEdge) {
  const longest = Math.max(width, height);
  if (longest <= longEdge) return { width, height };
  const scale = longEdge / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export async function generateDerivative(sourcePath, longEdge, destPath) {
  await sharp(sourcePath)
    .rotate() // honor EXIF orientation
    .resize(longEdge, longEdge, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(destPath);
}

export async function readDimensions(sourcePath) {
  const { width, height } = await sharp(sourcePath).rotate().metadata();
  return { width, height };
}
```

`.rotate()` with no argument applies the EXIF orientation tag. Without it, portrait photos come out sideways in the derivatives.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/derivatives.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/derivatives.js tests/derivatives.test.js
git commit -m "Add derivative sizing"
```

---

### Task 5: Manifest build and validation

**Files:**
- Create: `scripts/lib/manifest.js`
- Test: `tests/manifest.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/manifest.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { albumTitle, validateManifest } from '../scripts/lib/manifest.js';

test('derives a display title from a slug', () => {
  assert.equal(albumTitle('stoney-lake'), 'Stoney Lake');
  assert.equal(albumTitle('arizona'), 'Arizona');
});

test('accepts a well-formed manifest', () => {
  const m = {
    albums: [{
      slug: 'arizona',
      title: 'Arizona',
      photos: [{
        id: 'DSC_1486',
        thumb: '/photos/arizona/DSC_1486_thumb.jpg',
        med: '/photos/arizona/DSC_1486_med.jpg',
        full: '/photos/arizona/DSC_1486_full.jpg',
        width: 6048,
        height: 4032,
        caption: null,
        exif: { camera: 'NIKON Z5 II' },
      }],
    }],
  };
  assert.deepEqual(validateManifest(m), []);
});

test('reports a photo missing required dimensions', () => {
  const m = {
    albums: [{
      slug: 'arizona',
      title: 'Arizona',
      photos: [{
        id: 'DSC_1486',
        thumb: 't.jpg', med: 'm.jpg', full: 'f.jpg',
        caption: null, exif: {},
      }],
    }],
  };
  const errors = validateManifest(m);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /DSC_1486.*width/);
});

test('reports a manifest with no albums array', () => {
  assert.match(validateManifest({})[0], /albums/);
});
```

Dimensions are required because the grid reserves space from them; a photo without them causes layout shift.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/manifest.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/manifest.js

export function albumTitle(slug) {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const REQUIRED_PHOTO_FIELDS = ['id', 'thumb', 'med', 'full', 'width', 'height'];

export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || !Array.isArray(manifest.albums)) {
    errors.push('manifest must have an "albums" array');
    return errors;
  }

  for (const album of manifest.albums) {
    if (!album.slug) errors.push('album is missing "slug"');
    if (!Array.isArray(album.photos)) {
      errors.push(`album "${album.slug}" must have a "photos" array`);
      continue;
    }
    for (const photo of album.photos) {
      for (const field of REQUIRED_PHOTO_FIELDS) {
        if (photo[field] === undefined || photo[field] === null) {
          errors.push(`photo "${photo.id ?? '<no id>'}" is missing "${field}"`);
        }
      }
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/manifest.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/manifest.js tests/manifest.test.js
git commit -m "Add manifest build and validation"
```

---

### Task 6: Local target

Writes derivatives into `public/photos/` so the site works before any Firebase account exists. These files are gitignored — the `*.jpg` rule already covers them.

**Files:**
- Create: `scripts/lib/targets/local.js`

- [ ] **Step 1: Write the implementation**

```js
// scripts/lib/targets/local.js
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { SIZES, generateDerivative } from '../derivatives.js';

const PUBLIC_DIR = 'public/photos';

export function createLocalTarget() {
  return {
    name: 'local',

    async put(sourcePath, albumSlug, id) {
      const destDir = path.join(PUBLIC_DIR, albumSlug);
      await mkdir(destDir, { recursive: true });

      await generateDerivative(sourcePath, SIZES.thumb, path.join(destDir, `${id}_thumb.jpg`));
      await generateDerivative(sourcePath, SIZES.med, path.join(destDir, `${id}_med.jpg`));
      await copyFile(sourcePath, path.join(destDir, `${id}_full.jpg`));

      return {
        thumb: `/photos/${albumSlug}/${id}_thumb.jpg`,
        med: `/photos/${albumSlug}/${id}_med.jpg`,
        full: `/photos/${albumSlug}/${id}_full.jpg`,
      };
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/lib/targets/local.js
git commit -m "Add local build target"
```

---

### Task 7: Pipeline entry point

**Files:**
- Create: `scripts/build-photos.js`

- [ ] **Step 1: Write the implementation**

```js
// scripts/build-photos.js
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
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function listPhotos(albumDir) {
  const entries = await readdir(albumDir);
  return entries.filter((f) => /\.jpe?g$/i.test(f)).sort();
}

async function main() {
  const targetName = (process.argv.find((a) => a.startsWith('--target=')) ?? '--target=local').split('=')[1];
  const target = await loadTarget(targetName);

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
      const sourcePath = path.join(albumDir, filename);

      try {
        const raw = await exifr.parse(sourcePath, {
          pick: ['Model', 'LensModel', 'FNumber', 'ExposureTime', 'ISO', 'FocalLength', 'DateTimeOriginal', 'ImageDescription'],
        });
        const exif = normalizeExif(raw);
        const { width, height } = await readDimensions(sourcePath);
        const urls = await target.put(sourcePath, slug, id);

        photos.push({
          id,
          ...urls,
          width,
          height,
          caption: resolveCaption({ override: null, exifTitle: raw?.ImageDescription, id }),
          exif,
        });
        console.log(`  ok   ${slug}/${id}`);
      } catch (err) {
        // Keep going — one bad file shouldn't sink the whole batch.
        failures.push(`${slug}/${id}: ${err.message}`);
        console.error(`  FAIL ${slug}/${id}: ${err.message}`);
      }
    }

    albums.push({ slug, title: albumTitle(slug), photos });
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} photo(s) failed; manifest not written.`);
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
```

The manifest is written only after every photo succeeds — a partial manifest would silently drop photos from the site.

- [ ] **Step 2: Run the pipeline against the real photos**

Run: `npm run photos:local`
Expected: 17 `ok` lines, then `Wrote photos.json: 3 albums, 17 photos (target: local)`

- [ ] **Step 3: Verify the manifest**

Run: `node -e "const m=require('./photos.json'); console.log(m.albums.map(a=>a.slug+':'+a.photos.length).join(' '))"`
Expected: `arizona:5 budapest:3 stoney-lake:9`

- [ ] **Step 4: Commit**

```bash
git add scripts/build-photos.js photos.json
git commit -m "Add photo pipeline and generate manifest"
```

---

### Task 8: Theme and base layout

**Files:**
- Create: `src/styles/theme.css`, `src/layouts/Base.astro`

- [ ] **Step 1: Write the theme tokens**

```css
/* src/styles/theme.css */
:root {
  --bg: #f4efe8;
  --bg-raised: #ece5db;
  --text: #2b2620;
  --text-muted: #6b6155;
  --rule: #ddd3c6;
  --measure: 68rem;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; }

.wrap {
  max-width: var(--measure);
  margin: 0 auto;
  padding: 0 1.25rem;
}
```

- [ ] **Step 2: Write the base layout**

```astro
---
// src/layouts/Base.astro
import '../styles/theme.css';
const { title, description } = Astro.props;
const albums = ['arizona', 'budapest', 'stoney-lake'];
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
  </head>
  <body>
    <header class="wrap site-header">
      <a href="/" class="wordmark">Zouf</a>
      <nav>
        {albums.map((slug) => (
          <a href={`/albums/${slug}`}>{slug.replace('-', ' ')}</a>
        ))}
        <a href="/about">about</a>
      </nav>
    </header>
    <main class="wrap"><slot /></main>
    <footer class="wrap site-footer">
      <span>&copy; {new Date().getFullYear()} Matt Zouf</span>
    </footer>
    <style>
      .site-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 2rem;
        padding-top: 2.5rem;
        padding-bottom: 2.5rem;
        flex-wrap: wrap;
      }
      .wordmark {
        font-size: 1.05rem;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        text-decoration: none;
      }
      nav { display: flex; gap: 1.5rem; }
      nav a {
        font-size: 0.82rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-muted);
        text-decoration: none;
        transition: color 0.15s;
      }
      nav a:hover { color: var(--text); }
      .site-footer {
        margin-top: 5rem;
        padding: 2rem 1.25rem 3rem;
        border-top: 1px solid var(--rule);
        font-size: 0.78rem;
        color: var(--text-muted);
      }
    </style>
  </body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/theme.css src/layouts/Base.astro
git commit -m "Add warm neutral theme and base layout"
```

---

### Task 9: Masonry grid

CSS columns give true masonry with no JavaScript and no layout thrash. Each tile reserves space via `aspect-ratio` computed from the manifest dimensions, so nothing jumps as images load.

**Files:**
- Create: `src/components/MasonryGrid.astro`

- [ ] **Step 1: Write the component**

```astro
---
// src/components/MasonryGrid.astro
const { photos } = Astro.props;
---
<div class="masonry">
  {photos.map((photo, i) => (
    <button
      class="tile"
      data-index={i}
      style={`aspect-ratio: ${photo.width} / ${photo.height}`}
      aria-label={photo.caption ?? `Photo ${i + 1}`}
    >
      <img src={photo.thumb} alt={photo.caption ?? ''} loading="lazy" decoding="async" />
    </button>
  ))}
</div>

<style>
  .masonry { columns: 3; column-gap: 0.75rem; }
  @media (max-width: 900px) { .masonry { columns: 2; } }
  @media (max-width: 560px) { .masonry { columns: 1; } }

  .tile {
    display: block;
    width: 100%;
    margin: 0 0 0.75rem;
    padding: 0;
    border: 0;
    background: var(--bg-raised);
    cursor: zoom-in;
    break-inside: avoid;
    overflow: hidden;
  }
  .tile img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: opacity 0.2s;
  }
  .tile:hover img { opacity: 0.88; }
  .tile:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MasonryGrid.astro
git commit -m "Add masonry grid component"
```

---

### Task 10: Lightbox

Photo dominant, caption and a single EXIF line centered beneath. Keyboard: arrows navigate, Escape closes.

**Files:**
- Create: `src/components/Lightbox.astro`

- [ ] **Step 1: Write the component**

```astro
---
// src/components/Lightbox.astro
const { photos } = Astro.props;
---
<dialog class="lightbox" id="lightbox">
  <button class="close" aria-label="Close">&times;</button>
  <button class="nav prev" aria-label="Previous">&#8249;</button>
  <button class="nav next" aria-label="Next">&#8250;</button>
  <figure>
    <img id="lb-img" src="" alt="" />
    <figcaption>
      <span id="lb-caption"></span>
      <span id="lb-exif"></span>
      <a id="lb-full" href="" target="_blank" rel="noopener">View full resolution</a>
    </figcaption>
  </figure>
</dialog>

<script is:inline define:vars={{ photos }}>
  const dialog = document.getElementById('lightbox');
  const img = document.getElementById('lb-img');
  const captionEl = document.getElementById('lb-caption');
  const exifEl = document.getElementById('lb-exif');
  const fullEl = document.getElementById('lb-full');
  let current = 0;

  function exifLine(exif) {
    return [exif.camera, exif.lens, exif.aperture, exif.shutter, exif.iso && `ISO ${exif.iso}`]
      .filter(Boolean)
      .join(' · ');
  }

  function show(index) {
    current = (index + photos.length) % photos.length;
    const photo = photos[current];
    img.src = photo.med;
    img.alt = photo.caption ?? '';
    captionEl.textContent = photo.caption ?? '';
    captionEl.hidden = !photo.caption;
    const line = exifLine(photo.exif ?? {});
    exifEl.textContent = line;
    exifEl.hidden = line === '';
    fullEl.href = photo.full;
  }

  document.querySelectorAll('.tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      show(Number(tile.dataset.index));
      dialog.showModal();
    });
  });

  dialog.querySelector('.close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.prev').addEventListener('click', () => show(current - 1));
  dialog.querySelector('.next').addEventListener('click', () => show(current + 1));

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(current + 1);
    if (e.key === 'ArrowLeft') show(current - 1);
  });

  // Click the backdrop (outside the figure) to close.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
</script>

<style>
  .lightbox {
    border: 0;
    padding: 0;
    max-width: 100vw;
    max-height: 100vh;
    width: 100vw;
    height: 100vh;
    background: #14110e;
    color: #f0ebe4;
  }
  .lightbox::backdrop { background: rgba(20, 17, 14, 0.92); }
  .lightbox figure {
    margin: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    padding: 2.5rem 1.5rem;
  }
  .lightbox img {
    max-width: 100%;
    max-height: 78vh;
    object-fit: contain;
  }
  figcaption {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    text-align: center;
  }
  #lb-caption { font-size: 0.95rem; }
  #lb-exif {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9a9086;
  }
  #lb-full {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9a9086;
  }
  .close, .nav {
    position: fixed;
    background: none;
    border: 0;
    color: #9a9086;
    cursor: pointer;
    font-size: 2rem;
    line-height: 1;
    padding: 0.75rem;
  }
  .close { top: 0.75rem; right: 1rem; }
  .nav { top: 50%; transform: translateY(-50%); font-size: 3rem; }
  .prev { left: 0.5rem; }
  .next { right: 0.5rem; }
  .close:hover, .nav:hover { color: #f0ebe4; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Lightbox.astro
git commit -m "Add lightbox component"
```

---

### Task 11: Pages

**Files:**
- Create: `src/pages/index.astro`, `src/pages/albums/[slug].astro`, `src/pages/about.astro`

- [ ] **Step 1: Write the home page**

```astro
---
// src/pages/index.astro
import Base from '../layouts/Base.astro';
import MasonryGrid from '../components/MasonryGrid.astro';
import Lightbox from '../components/Lightbox.astro';
import manifest from '../../photos.json';

const photos = manifest.albums.flatMap((album) => album.photos);
---
<Base title="Zouf — Photography" description="Photographs from the trail, the road, and the water.">
  <MasonryGrid photos={photos} />
  <Lightbox photos={photos} />
</Base>
```

- [ ] **Step 2: Write the album page**

```astro
---
// src/pages/albums/[slug].astro
import Base from '../../layouts/Base.astro';
import MasonryGrid from '../../components/MasonryGrid.astro';
import Lightbox from '../../components/Lightbox.astro';
import manifest from '../../../photos.json';

export function getStaticPaths() {
  return manifest.albums.map((album) => ({
    params: { slug: album.slug },
    props: { album },
  }));
}

const { album } = Astro.props;
---
<Base title={`${album.title} — Zouf`}>
  <h1>{album.title}</h1>
  <MasonryGrid photos={album.photos} />
  <Lightbox photos={album.photos} />
</Base>

<style>
  h1 {
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 0 0 2rem;
  }
</style>
```

`getStaticPaths` cannot reference `manifest` before its import is evaluated, so the import must stay at the top of the frontmatter — it already is.

- [ ] **Step 3: Write the about page**

```astro
---
// src/pages/about.astro
import Base from '../layouts/Base.astro';
---
<Base title="About — Zouf">
  <div class="about">
    <h1>About</h1>
    <p>
      I photograph the places I end up when I'm out on a bike or on foot —
      desert ridgelines, city mornings, and a lake in the Kawarthas I keep
      coming back to.
    </p>
    <p>
      Shot on a Nikon Z5 II and a Z50 II.
    </p>
    <p><a href="mailto:mattzouf@gmail.com">mattzouf@gmail.com</a></p>
  </div>
</Base>

<style>
  .about { max-width: 34rem; padding-bottom: 2rem; }
  h1 {
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 0 0 2rem;
  }
  p { line-height: 1.7; margin: 0 0 1.25rem; }
  a { color: var(--text); }
</style>
```

The bio is a placeholder for the user to rewrite — it is real prose, not a TODO, so the site is shippable as-is.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: builds 5 pages (`/`, `/albums/arizona`, `/albums/budapest`, `/albums/stoney-lake`, `/about`) with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/
git commit -m "Add home, album, and about pages"
```

---

### Task 12: Browser verification

- [ ] **Step 1: Start the dev server**

Create `.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "photo-portfolio", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 4321 }
  ]
}
```

Start it with the preview tooling, not a raw shell command.

- [ ] **Step 2: Check the console for errors**

Expected: no errors. A 404 on any `/photos/...` path means `npm run photos:local` was not run.

- [ ] **Step 3: Verify the grid**

Confirm 17 tiles render, portrait photos are taller than landscape ones, and the page does not scroll horizontally.

- [ ] **Step 4: Verify the lightbox**

Click a tile — it opens with the photo large, caption/EXIF beneath. Arrow keys move between photos, Escape closes.

- [ ] **Step 5: Verify mobile width**

Resize to 375px. Expected: one column, no horizontal scroll.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "Fix issues found in browser verification"
```

---

### Task 13: Firebase target and deploy config

Depends on the Firebase project existing. Everything before this task works without it.

**Files:**
- Create: `scripts/lib/targets/firebase.js`, `firebase.json`, `.firebaserc`

- [ ] **Step 1: Write the Firebase target**

```js
// scripts/lib/targets/firebase.js
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import admin from 'firebase-admin';
import { SIZES, generateDerivative } from '../derivatives.js';

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET;

export function createFirebaseTarget() {
  if (!BUCKET) throw new Error('Set FIREBASE_STORAGE_BUCKET (e.g. zouf-photo.firebasestorage.app)');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account key path');
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: BUCKET,
  });
  const bucket = admin.storage().bucket();

  async function upload(localPath, objectPath) {
    await bucket.upload(localPath, {
      destination: objectPath,
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
    await bucket.file(objectPath).makePublic();
    return `https://storage.googleapis.com/${BUCKET}/${objectPath}`;
  }

  return {
    name: 'firebase',

    async put(sourcePath, albumSlug, id) {
      const work = await mkdtemp(path.join(tmpdir(), 'photo-'));
      const thumbPath = path.join(work, 'thumb.jpg');
      const medPath = path.join(work, 'med.jpg');

      await generateDerivative(sourcePath, SIZES.thumb, thumbPath);
      await generateDerivative(sourcePath, SIZES.med, medPath);

      return {
        thumb: await upload(thumbPath, `photos/${albumSlug}/${id}_thumb.jpg`),
        med: await upload(medPath, `photos/${albumSlug}/${id}_med.jpg`),
        full: await upload(sourcePath, `photos/${albumSlug}/${id}_full.jpg`),
      };
    },
  };
}
```

- [ ] **Step 2: Write `firebase.json`**

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "headers": [
      {
        "source": "**/*.@(jpg|jpeg|png|webp|avif)",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
      }
    ]
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/targets/firebase.js firebase.json
git commit -m "Add Firebase Storage target and hosting config"
```

---

### Task 14: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write it**

```markdown
# zouf.photo

Personal photography portfolio. Astro static site on Firebase Hosting; images in
Firebase Storage.

## Adding photos

1. Export JPEGs from Lightroom into `~/Pictures/Photo Portfolio Highlights/<album>/`.
   A new subfolder becomes a new album automatically.
2. `npm run photos:upload` — reads EXIF, generates derivatives, uploads to Storage,
   rewrites `photos.json`.
3. `git add -A && git commit && git push`
4. `npm run build && firebase deploy`

## Local development

`npm run photos:local` writes derivatives to `public/photos/` (gitignored) so the
site runs with no cloud account. Then `npm run dev`.

## Tests

`npm test`

## Why images aren't in git

Source photos are 2.5–20 MB each. Only `photos.json` — a few KB — is committed.
The image bytes live in Firebase Storage.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README"
```

---

## Deferred until accounts exist

These need the user's credentials and are not part of implementation:

- Register `zouf.photo`, point DNS at Firebase Hosting
- Create the GitHub repo and `git push -u origin main`
- Create the Firebase project, enable Storage, download a service account key
- Run `npm run photos:upload` to move images from local to Storage
- `firebase deploy`
