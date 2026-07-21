import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { SIZES, generateDerivative } from '../derivatives.js';
import { contentHash, derivativeName } from '../naming.js';

// Derivatives land in public/, which Astro serves as-is. These files are
// gitignored — the repo's *.jpg rule covers them — and can be deleted and
// regenerated at any time with `npm run photos:local`.
const PUBLIC_DIR = 'public/photos';

export function createLocalTarget() {
  return {
    name: 'local',

    async put(sourcePath, albumSlug, id) {
      const destDir = path.join(PUBLIC_DIR, albumSlug);
      await mkdir(destDir, { recursive: true });

      const hash = await contentHash(sourcePath);
      const names = {
        thumb: derivativeName(id, hash, 'thumb'),
        med: derivativeName(id, hash, 'med'),
        full: derivativeName(id, hash, 'full'),
      };

      await generateDerivative(sourcePath, SIZES.thumb, path.join(destDir, names.thumb));
      await generateDerivative(sourcePath, SIZES.med, path.join(destDir, names.med));
      await copyFile(sourcePath, path.join(destDir, names.full));

      return {
        thumb: `/photos/${albumSlug}/${names.thumb}`,
        med: `/photos/${albumSlug}/${names.med}`,
        full: `/photos/${albumSlug}/${names.full}`,
      };
    },
  };
}
