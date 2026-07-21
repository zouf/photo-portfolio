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

test('leaves a photo exactly at the target unchanged', () => {
  assert.deepEqual(targetDimensions(600, 400, 600), { width: 600, height: 400 });
});

test('defines thumb and med sizes', () => {
  assert.equal(SIZES.thumb, 600);
  assert.equal(SIZES.med, 2400);
});
