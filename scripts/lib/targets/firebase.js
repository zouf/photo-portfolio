import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import admin from 'firebase-admin';
import { SIZES, generateDerivative } from '../derivatives.js';

export function createFirebaseTarget() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;

  if (!bucketName) {
    throw new Error(
      'Set FIREBASE_STORAGE_BUCKET (e.g. zouf-photo.firebasestorage.app)'
    );
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'Set GOOGLE_APPLICATION_CREDENTIALS to the path of a service account key file'
    );
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: bucketName,
  });
  const bucket = admin.storage().bucket();

  // Derivatives are content-addressed by name and never change once written, so
  // they can be cached indefinitely.
  async function upload(localPath, objectPath) {
    await bucket.upload(localPath, {
      destination: objectPath,
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
    await bucket.file(objectPath).makePublic();
    return `https://storage.googleapis.com/${bucketName}/${objectPath}`;
  }

  return {
    name: 'firebase',

    async put(sourcePath, albumSlug, id) {
      const work = await mkdtemp(path.join(tmpdir(), 'photo-'));
      try {
        const thumbPath = path.join(work, 'thumb.jpg');
        const medPath = path.join(work, 'med.jpg');

        await generateDerivative(sourcePath, SIZES.thumb, thumbPath);
        await generateDerivative(sourcePath, SIZES.med, medPath);

        return {
          thumb: await upload(thumbPath, `photos/${albumSlug}/${id}_thumb.jpg`),
          med: await upload(medPath, `photos/${albumSlug}/${id}_med.jpg`),
          full: await upload(sourcePath, `photos/${albumSlug}/${id}_full.jpg`),
        };
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    },
  };
}
