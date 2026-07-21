# photo-portfolio

Personal photography portfolio. Astro static site on Firebase Hosting, with the
image files in Firebase Storage.

Live on the default Firebase subdomain (`<project-id>.web.app`). To attach a
custom domain later, set it in the Firebase console and export `SITE_URL`.

## Adding photos

1. Export JPEGs from Lightroom into `~/Pictures/Photo Portfolio Highlights/<album>/`.
   A new subfolder becomes a new album automatically — no code changes.
2. `npm run photos:upload` — reads EXIF, generates derivatives, uploads to
   Storage, rewrites `photos.json`.
3. `git add -A && git commit && git push`
4. `npm run build && firebase deploy`

Uploading needs two environment variables:

```bash
export FIREBASE_STORAGE_BUCKET=<project-id>.firebasestorage.app
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

## Local development

```bash
npm run photos:local   # derivatives into public/photos/ (gitignored)
npm run dev            # http://localhost:4321
```

`photos:local` means the site runs with no cloud account at all — useful for
working on layout before touching Firebase.

## Tests

```bash
npm test
```

Covers the pipeline logic: EXIF normalization, caption resolution, derivative
sizing, and manifest validation. The Astro components are verified in the
browser rather than unit tested.

## How it fits together

```
~/Pictures/Photo Portfolio Highlights/   staging — full-res Lightroom exports
        │
        │  npm run photos:upload
        ▼
Firebase Storage                          thumb (600px) / med (2400px) / full
        │
        │  writes URLs + EXIF into
        ▼
photos.json                               ~12 KB — the only image data in git
        │
        │  npm run build
        ▼
dist/                                     static site → firebase deploy
```

## Why images aren't in git

Source photos run 2.5–20 MB each; the current 17 are 164 MB. Committing them
would bloat the repo permanently for no benefit, since the web never needs full
resolution inline. Only `photos.json` is committed. Full resolution stays
available to visitors — served from Storage, linked from each lightbox.

## Albums

| Album | Photos | Captured |
| --- | --- | --- |
| Arizona | 5 | Apr 2026 |
| Budapest | 3 | Jun 2026 |
| Stoney Lake | 9 | Jul 2026 |

## Docs

- [Design spec](docs/superpowers/specs/2026-07-21-photo-portfolio-design.md)
- [Implementation plan](docs/superpowers/plans/2026-07-21-photo-portfolio.md)
