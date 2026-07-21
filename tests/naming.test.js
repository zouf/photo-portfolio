import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { contentHash, derivativeName } from '../scripts/lib/naming.js';

test('builds a derivative filename containing the hash', () => {
  assert.equal(
    derivativeName('DSC_2803', 'a1b2c3d4', 'thumb'),
    'DSC_2803_a1b2c3d4_thumb.jpg'
  );
  assert.equal(
    derivativeName('DSC_2803', 'a1b2c3d4', 'full'),
    'DSC_2803_a1b2c3d4_full.jpg'
  );
});

test('identical content produces an identical hash', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hash-'));
  const a = path.join(dir, 'a.jpg');
  const b = path.join(dir, 'b.jpg');
  await writeFile(a, 'same bytes');
  await writeFile(b, 'same bytes');
  assert.equal(await contentHash(a), await contentHash(b));
});

// This is the whole point: a re-edited export must produce a different URL, or
// caches tagged `immutable` will serve the old image for a year.
test('different content produces a different hash', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hash-'));
  const a = path.join(dir, 'a.jpg');
  const b = path.join(dir, 'b.jpg');
  await writeFile(a, 'original edit');
  await writeFile(b, 'revised edit');
  assert.notEqual(await contentHash(a), await contentHash(b));
});

test('hash is short and URL-safe', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hash-'));
  const f = path.join(dir, 'a.jpg');
  await writeFile(f, 'bytes');
  const h = await contentHash(f);
  assert.equal(h.length, 8);
  assert.match(h, /^[0-9a-f]{8}$/);
});
