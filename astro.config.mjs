import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://blog.ytn520.top',
  output: 'static',
  trailingSlash: 'always',
  markdown: {
    shikiConfig: {
      // 暗黑模式默认 one-dark-pro；浅模式 github-light
      themes: { light: 'github-light', dark: 'one-dark-pro' },
      wrap: true,
    },
  },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !new URL(page).pathname.startsWith('/search/'),
    }),
  ],
});

