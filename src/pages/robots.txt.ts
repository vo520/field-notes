import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  // 域名只在 astro.config.mjs（site / SITE_URL）维护，这里不再写死兜底值
  if (!site) throw new Error('缺少 site 配置：astro.config.mjs 必须设置 site 才能生成 robots.txt');

  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${new URL(`${import.meta.env.BASE_URL}sitemap-index.xml`, site).href}\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
};
