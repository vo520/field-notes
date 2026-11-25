import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

import { siteConfig } from '../config/site';
import { isVisibleEntry, sortByPublishedAt } from '../lib/content';

export async function GET(context: { site?: URL }) {
  const articles = sortByPublishedAt(
    (await getCollection('articles')).filter((entry) => isVisibleEntry(entry, import.meta.env.PROD)),
  );

  const site = context.site;
  // 域名只在 astro.config.mjs（site / SITE_URL）维护，这里不再写死兜底值
  if (!site) throw new Error('缺少 site 配置：astro.config.mjs 必须设置 site 才能生成 RSS 绝对链接');
  const lastBuildDate = articles
    .flatMap((article) => [article.data.publishedAt, article.data.updatedAt])
    .filter((date): date is Date => date instanceof Date)
    .reduce<Date | undefined>((latest, date) => (!latest || date > latest ? date : latest), undefined);

  return rss({
    title: siteConfig.title,
    description: siteConfig.description,
    site,
    customData: [
      '<language>zh-CN</language>',
      lastBuildDate ? `<lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>` : '',
    ].join(''),
    items: articles.map((article) => ({
      title: article.data.title,
      description: article.data.description,
      pubDate: article.data.publishedAt,
      link: `/articles/${article.id}/`,
      categories: article.data.tags,
    })),
  });
}
