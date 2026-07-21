// Nikon writes model names like "Z5_2", meaning the Z5 II. Showing the raw
// value on the site looks like a bug, so translate the ones we know.
function formatCamera(model) {
  return model.replace(/^(NIKON Z\d+)_2$/, '$1 II');
}

function formatShutter(seconds) {
  if (seconds >= 1) return `${seconds}s`;
  return `1/${Math.round(1 / seconds)}`;
}

// EXIF capture time is wall-clock time where the photo was taken — it carries no
// timezone. toISOString() would shift it by the machine's UTC offset, so format
// the local components directly.
function formatLocal(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function normalizeExif(raw) {
  if (!raw) return {};

  const out = {};
  if (raw.Model) out.camera = formatCamera(raw.Model);
  if (raw.LensModel) out.lens = raw.LensModel;
  if (raw.FNumber) out.aperture = `f/${raw.FNumber}`;
  if (raw.ExposureTime) out.shutter = formatShutter(raw.ExposureTime);
  if (raw.ISO) out.iso = raw.ISO;
  if (raw.FocalLength) out.focalLength = `${Math.round(raw.FocalLength)}mm`;
  if (raw.DateTimeOriginal) {
    const d = raw.DateTimeOriginal instanceof Date
      ? raw.DateTimeOriginal
      : new Date(raw.DateTimeOriginal);
    out.capturedAt = formatLocal(d);
  }
  return out;
}
