# Photo Portfolio — Design

**Date:** 2026-07-21
**Status:** Approved

## Purpose

A personal photography portfolio to showcase Matt's photos. Display only — no
sales, no client booking, no blog.

## Stack

| Concern | Choice |
|---|---|
| Site framework | Astro (static output) |
| Code hosting | GitHub — `github.com/zouf/photo-portfolio` |
| Site hosting | Firebase Hosting |
| Domain | `zouf.photo` |
| Image hosting | Firebase Storage (Google Cloud Storage bucket) |
| Image processing | `sharp` (local, in the upload script) |
| EXIF extraction | Node EXIF library (e.g. `exifr`), local |

Astro was chosen over Next.js because the site is almost entirely static content
with heavy imagery: Astro ships near-zero JavaScript by default and has
first-class image handling. Firebase was chosen for both hosting concerns to keep
everything in one Google project, since the user already has a Google billing
account attached.

## Core architectural decision: images never enter git

The source photos are 2.5–20 MB each (164 MB for the initial 17). Committing them
would bloat the repository permanently and serve no purpose, since the web never
needs full-resolution files inline. But full resolution must remain *available* to
visitors.

The split:

```
GitHub repo (small, text only)        Firebase Storage (the image bytes)
├── Astro site code                    photos/arizona/
├── photos.json   ← manifest, few KB     ├── DSC_1486_full.jpg   (original)
├── scripts/upload-photos.js             ├── DSC_1486_med.jpg    (~2400px)
└── docs/                                └── DSC_1486_thumb.jpg  (~600px)
```

`photos.json` is the contract between the two halves. It is the only thing the
site build reads, and it is small enough to live comfortably in git.

### Three derivatives per photo

| Size | Long edge | Used by |
|---|---|---|
| `thumb` | ~600px | Masonry grid |
| `med` | ~2400px | Lightbox view |
| `full` | original | "View / download full resolution" link |

## Content model

One folder per album. Albums are the site's categories.

Source of truth is the local staging folder `~/Pictures/Photo Portfolio Highlights/`,
already sorted:

| Album | Slug | Photos | Captured | Camera |
|---|---|---|---|---|
| Arizona | `arizona` | 5 | Apr 5–8, 2026 | Nikon Z5 II |
| Budapest | `budapest` | 3 | Jun 1–3, 2026 | Nikon Z5 II |
| Stoney Lake | `stoney-lake` | 9 | Jul 12–19, 2026 | Nikon Z50 II + Z5 II |

Adding an album later means creating a new subfolder and re-running the upload
script. No code changes.

### Captions and metadata

Each photo carries EXIF: camera model, lens, aperture, shutter speed, ISO, focal
length, capture date. The upload script reads these and writes them into the
manifest.

Caption resolution order:

1. An explicit caption in `photos.json` (hand-edited, wins over everything)
2. The photo's EXIF/IPTC title field, if present
3. Omitted — no caption shown

Filenames (`DSC_1486`) are never displayed as captions.

## Visual design

Validated through browser mockups during brainstorming.

**Layout — masonry grid.** Photos keep their natural aspect ratio and pack tightly
with no gaps. Chosen over a uniform cropped grid (which would crop the user's
compositions) and over a single-column editorial scroll (too slow for browsing).
The initial set is 14 landscape and 3 portrait, so variable heights are genuinely
used.

**Theme — warm neutral.** Cream/off-white background, soft dark text. Chosen over
stark white and over dark/moody. Rationale: it's editorial and quiet, and it lets
the photographs supply all the color.

**Lightbox — minimal, caption below.** Clicking a photo opens a full-screen view
where the photo dominates the frame. Caption and a single EXIF line sit centered
beneath it, small and low-contrast:

```
                    Golden hour, Point Reyes
        NIKON Z5 II · 35MM F1.8 · F2.8 · 1/500 · ISO 100
```

Chosen over a persistent side metadata panel, which shrinks the photo to make room
for information most visitors don't want. Next/previous navigation moves through
the current album.

## Pages

- **Home** — masonry grid across all albums
- **Album page** (one per album) — masonry grid scoped to that album
- **About / Contact** — short bio, email link to `mattzouf@gmail.com`

## The upload pipeline

A local Node script, `npm run upload`. It is the only thing that touches Firebase
Storage.

For each photo in the staging folder:

1. Read EXIF (camera, lens, aperture, shutter, ISO, focal length, capture date)
2. Generate `thumb` (~600px) and `med` (~2400px) with `sharp`
3. Upload `thumb`, `med`, and `full` to Firebase Storage under `photos/<album>/`
4. Record the three URLs plus all metadata into `photos.json`

The script is idempotent: re-running it skips photos already uploaded and unchanged,
so adding one photo to an album doesn't re-upload the other sixteen.

### Manifest shape

```json
{
  "albums": [
    {
      "slug": "arizona",
      "title": "Arizona",
      "photos": [
        {
          "id": "DSC_1486",
          "thumb": "https://.../DSC_1486_thumb.jpg",
          "med":   "https://.../DSC_1486_med.jpg",
          "full":  "https://.../DSC_1486_full.jpg",
          "width": 6048,
          "height": 4032,
          "caption": null,
          "exif": {
            "camera": "NIKON Z5 II",
            "lens": "...",
            "aperture": "f/2.8",
            "shutter": "1/500",
            "iso": 100,
            "focalLength": "35mm",
            "capturedAt": "2026-04-05T18:59:08"
          }
        }
      ]
    }
  ]
}
```

Intrinsic `width`/`height` are stored so the masonry grid can reserve correct space
before images load, avoiding layout shift.

## Publishing workflow

```
1. Export JPEGs from Lightroom → ~/Pictures/Photo Portfolio Highlights/<album>/
2. npm run upload      # derivatives + upload + manifest
3. git add -A && git commit && git push
4. firebase deploy     # site goes live
```

Full-resolution originals stay in Lightroom and in Firebase Storage. Only the
manifest and code move through git.

## Error handling

- **Upload script:** fail loudly per photo with the filename, and continue with the
  rest rather than aborting the batch. A partial manifest is worse than a partial
  upload, so the manifest is written only after all photos are processed.
- **Missing EXIF:** treat every EXIF field as optional. Render whichever fields
  exist; if none do, omit the metadata line entirely rather than printing blanks.
- **Site build:** if `photos.json` is missing or malformed, fail the build with a
  clear message — never deploy an empty gallery silently.
- **Broken image URL at runtime:** the grid tile keeps its reserved space and
  degrades to empty rather than collapsing the layout.

## Testing

- **Upload script** is the only real logic and gets unit tests: EXIF parsing
  (including photos with fields missing), caption resolution order, derivative
  sizing math, idempotency (re-running produces no new uploads).
- **Manifest schema** gets a validation test so a malformed manifest fails in CI
  rather than at deploy.
- **Site rendering** is verified in the browser: grid layout at desktop and mobile
  widths, lightbox open/close and next/prev, and that portrait and landscape photos
  both sit correctly in the masonry flow.

## Domain

`zouf.photo` — chosen over concept names (`firstlight.photo`, `outandback.photo`)
and over `mattzouf.com`. The handle-based name stays accurate regardless of what
the work becomes, and the `.photo` TLD completes the phrase so the whole domain is
two syllables.

Verified unregistered as of 2026-07-21 (no NS, A, or SOA records). `zouf.com` is
parked by a reseller and would be an aftermarket purchase.

Firebase Hosting provides custom domains and SSL certificates at no cost.
Connecting it is: add the domain in the Firebase console, then set the two DNS
records it provides at the registrar.

## Known setup tasks

- Create the empty `photo-portfolio` repo on GitHub. The `gh` CLI is not installed
  on this machine; SSH auth to GitHub already works as `zouf`. Either install `gh`
  or create the repo through the web UI.
- Create the Firebase project and enable Storage (requires the billing account,
  which the user has).
- Configure the Storage bucket for public read on the `photos/` prefix.
- Register `zouf.photo` and point it at Firebase Hosting. Registration requires
  entering payment details, so this is the user's to do.

## Out of scope

Print sales, e-commerce, client galleries, password-protected albums, a blog or
written posts, visitor comments, and an admin upload UI. Photos are added from a
computer via the Lightroom-export-and-upload workflow described above.
