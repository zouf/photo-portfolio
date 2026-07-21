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

test('leaves unrecognized camera models untouched', () => {
  assert.equal(normalizeExif({ Model: 'Canon EOS R6' }).camera, 'Canon EOS R6');
});
