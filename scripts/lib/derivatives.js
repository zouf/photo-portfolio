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

// .rotate() with no argument applies the EXIF orientation tag. Without it,
// portrait photos come out of the resize sideways.
export async function generateDerivative(sourcePath, longEdge, destPath) {
  await sharp(sourcePath)
    .rotate()
    .resize(longEdge, longEdge, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(destPath);
}

export async function readDimensions(sourcePath) {
  const { width, height } = await sharp(sourcePath).rotate().metadata();
  return { width, height };
}
