import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCaption } from '../scripts/lib/caption.js';

test('an explicit override wins over everything', () => {
  assert.equal(
    resolveCaption({ override: 'Golden hour', exifTitle: 'Superstition Ridge', id: 'DSC_1486' }),
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

test('trims surrounding whitespace', () => {
  assert.equal(
    resolveCaption({ override: '  Blue hour  ', exifTitle: null, id: 'DSC_1486' }),
    'Blue hour'
  );
});
