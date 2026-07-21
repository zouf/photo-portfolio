import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { SIZES, generateDerivative } from '../derivatives.js';
import { contentHash, derivativeName } from '../naming.js';

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

  const app = initializeApp({
    credential: applicationDefault(),
    storageBucket: bucketName,
  });
  const bucket = getStorage(app).bucket();

  let uploaded = 0;
  let skipped = 0;
  let photosUploaded = 0;

  // New buckets default to uniform bucket-level access, which disables per-object
  // ACLs — so file.makePublic() throws. Grant public read once at the bucket
  // level instead. Idempotent: re-running finds the binding already present.
  async function ensurePublicRead() {
    const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });
    const ROLE = 'roles/storage.objectViewer';

    const existing = policy.bindings.find(
      (b) => b.role === ROLE && !b.condition
    );
    if (existing?.members.includes('allUsers')) return 'already public';

    if (existing) {
      existing.members.push('allUsers');
    } else {
      policy.bindings.push({ role: ROLE, members: ['allUsers'] });
    }

    await bucket.iam.setPolicy(policy);
    return 'granted public read';
  }

  // Safe only because object names carry a content hash — see naming.js. A
  // re-edited photo uploads to a new path, so `immutable` never serves stale.
  //
  // That same hash makes skipping sound: if the object name is already present,
  // its bytes are by definition the ones we were about to upload. This keeps
  // re-runs cheap and makes an interrupted upload resumable.
  async function upload(localPath, objectPath) {
    const url = `https://storage.googleapis.com/${bucketName}/${objectPath}`;
    const [exists] = await bucket.file(objectPath).exists();
    if (exists) {
      skipped += 1;
      return url;
    }

    await bucket.upload(localPath, {
      destination: objectPath,
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
    uploaded += 1;
    return url;
  }

  return {
    name: 'firebase',

    async init() {
      const [exists] = await bucket.exists();
      if (!exists) {
        throw new Error(
          `Bucket "${bucketName}" does not exist. Enable Storage in the Firebase ` +
            `console (requires the Blaze plan), then re-run.`
        );
      }
      console.log(`  bucket ${bucketName}: ${await ensurePublicRead()}`);
    },

    async put(sourcePath, albumSlug, id) {
      const hash = await contentHash(sourcePath);
      const object = (size) => `photos/${albumSlug}/${derivativeName(id, hash, size)}`;
      const url = (size) => `https://storage.googleapis.com/${bucketName}/${object(size)}`;
      const urls = { thumb: url('thumb'), med: url('med'), full: url('full') };

      // Resizing is the slow part, so check before doing any of it. All three
      // present means this exact photo is already fully uploaded.
      const present = await Promise.all(
        ['thumb', 'med', 'full'].map((s) =>
          bucket.file(object(s)).exists().then(([e]) => e)
        )
      );
      if (present.every(Boolean)) {
        skipped += 3;
        return urls;
      }

      const work = await mkdtemp(path.join(tmpdir(), 'photo-'));
      try {
        const thumbPath = path.join(work, 'thumb.jpg');
        const medPath = path.join(work, 'med.jpg');

        await generateDerivative(sourcePath, SIZES.thumb, thumbPath);
        await generateDerivative(sourcePath, SIZES.med, medPath);

        await upload(thumbPath, object('thumb'));
        await upload(medPath, object('med'));
        await upload(sourcePath, object('full'));
        photosUploaded += 1;
        return urls;
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    },

    photosUploaded() {
      return photosUploaded;
    },

    summary() {
      return `${uploaded} object(s) uploaded, ${skipped} already present`;
    },
  };
}
