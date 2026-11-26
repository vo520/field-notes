import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://blog.ytn520.top',
  output: 'static',
  trailingSlash: 'always',
  // 悬停预取：鼠标停留即预载目标页，配合 View Transitions 让站内导航近乎瞬时。
  // hover 策略只在用户有明确跳转意图时才消耗带宽，不预载整站。
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  markdown: {
    shikiConfig: {
      // 暗黑模式默认 one-dark-pro；浅模式 github-light
      themes: { light: 'github-light', dark: 'one-dark-pro' },
      wrap: true,
    },
    // 注：新 Markdown 处理器下 rehypePlugins 需额外安装 @astrojs/markdown-remark，
    // 为避免新增依赖，外链加固改为客户端实现（ProseEnhancements）
  },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => {
        const { pathname } = new URL(page);
        return !pathname.startsWith('/search/') && !pathname.startsWith('/admin/');
      },
    }),
  ],
});

