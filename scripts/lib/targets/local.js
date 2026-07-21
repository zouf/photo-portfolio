import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { SIZES, generateDerivative } from '../derivatives.js';

// Derivatives land in public/, which Astro serves as-is. These files are
// gitignored — the repo's *.jpg rule covers them.
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
