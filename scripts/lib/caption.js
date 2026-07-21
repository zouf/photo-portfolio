function clean(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Order: an explicit override, then the photo's own EXIF title, then nothing.
// A filename is never a caption — Lightroom sometimes writes one into the title
// field, and "DSC_1486" under a photo reads as a bug.
export function resolveCaption({ override, exifTitle, id }) {
  const explicit = clean(override);
  if (explicit) return explicit;

  const title = clean(exifTitle);
  if (title && title !== id) return title;

  return null;
}
