import { defineConfig } from 'astro/config';

// Custom domain: explore.photo (connected via Firebase Hosting). Firebase also
// keeps serving the site at photo-portfolio-88316.web.app. Override with SITE_URL
// if needed.
const site = process.env.SITE_URL ?? 'https://explore.photo';

export default defineConfig({
  site,
  output: 'static',
});
