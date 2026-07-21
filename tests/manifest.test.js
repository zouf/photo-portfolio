import { test } from 'node:test';
import assert from 'node:assert/strict';
import { albumTitle, validateManifest } from '../scripts/lib/manifest.js';

function photo(overrides = {}) {
  return {
    id: 'DSC_1486',
    thumb: '/photos/arizona/DSC_1486_thumb.jpg',
    med: '/photos/arizona/DSC_1486_med.jpg',
    full: '/photos/arizona/DSC_1486_full.jpg',
    width: 6048,
    height: 4032,
    caption: null,
    exif: { camera: 'NIKON Z5 II' },
    ...overrides,
  };
}

test('derives a display title from a slug', () => {
  assert.equal(albumTitle('stoney-lake'), 'Stoney Lake');
  assert.equal(albumTitle('arizona'), 'Arizona');
});

test('accepts a well-formed manifest', () => {
  const m = { albums: [{ slug: 'arizona', title: 'Arizona', photos: [photo()] }] };
  assert.deepEqual(validateManifest(m), []);
});

test('reports a photo missing required dimensions', () => {
  const p = photo();
  delete p.width;
  const m = { albums: [{ slug: 'arizona', title: 'Arizona', photos: [p] }] };
  const errors = validateManifest(m);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /DSC_1486.*width/);
});

test('reports a manifest with no albums array', () => {
  assert.match(validateManifest({})[0], /albums/);
  assert.match(validateManifest(null)[0], /albums/);
});

test('reports an album missing its photos array', () => {
  const m = { albums: [{ slug: 'arizona', title: 'Arizona' }] };
  assert.match(validateManifest(m)[0], /arizona.*photos/);
});

test('a caption of null is valid — not every photo has one', () => {
  const m = { albums: [{ slug: 'arizona', title: 'Arizona', photos: [photo({ caption: null })] }] };
  assert.deepEqual(validateManifest(m), []);
});
