import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

// Derivatives are served with `Cache-Control: immutable`, so their URLs must
// change whenever the image does. Naming them by content hash makes that true:
// a re-edited export becomes a new URL instead of silently hiding behind a
// year-old cache entry.
export async function contentHash(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex').slice(0, 8);
}

export function derivativeName(id, hash, size) {
  return `${id}_${hash}_${size}.jpg`;
}
