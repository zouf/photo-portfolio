export function albumTitle(slug) {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Dimensions are required: the grid reserves each tile's space from them, so a
// photo without them causes layout shift as images load.
const REQUIRED_PHOTO_FIELDS = ['id', 'thumb', 'med', 'full', 'width', 'height'];

export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || !Array.isArray(manifest.albums)) {
    errors.push('manifest must have an "albums" array');
    return errors;
  }

  for (const album of manifest.albums) {
    if (!album.slug) errors.push('album is missing "slug"');
    if (!Array.isArray(album.photos)) {
      errors.push(`album "${album.slug}" must have a "photos" array`);
      continue;
    }
    for (const photo of album.photos) {
      for (const field of REQUIRED_PHOTO_FIELDS) {
        if (photo[field] === undefined || photo[field] === null) {
          errors.push(`photo "${photo.id ?? '<no id>'}" is missing "${field}"`);
        }
      }
    }
  }

  return errors;
}
