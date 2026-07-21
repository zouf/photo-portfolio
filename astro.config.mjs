import { defineConfig } from 'astro/config';

// Firebase serves the site at <project-id>.web.app until a custom domain is
// attached. Override with SITE_URL when that changes.
const site = process.env.SITE_URL ?? 'https://photo-portfolio.web.app';

export default defineConfig({
  site,
  output: 'static',
});
