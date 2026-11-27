import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

import { siteConfig } from '../config/site';
import { isPublishedProject, isVisibleEntry } from '../lib/content';

/**
 * 全站导航清单：命令面板与页脚「随便看看」共用的唯一数据源。
 *
 * 之前这两份清单以 JSON 字符串形式内联进每个页面的 HTML，
 * 98 个页面各背约 9KB 重复数据（移动端首屏白传）。
 * 改为构建期生成一份静态 JSON，页面只按需拉取一次，
 * 拉取后缓存在 sessionStorage，后续导航不再重复请求。
 */
export const GET: APIRoute = async () => {
  const env = import.meta.env;

  const articles = (await getCollection('articles'))
    .filter((entry) => isVisibleEntry(entry, env.PROD))
    .map((entry) => ({ label: entry.data.title, href: `/articles/${entry.id}/` }));
  const projects = (await getCollection('projects'))
    .filter((entry) => isPublishedProject(entry, env.PROD))
    .map((entry) => ({ label: entry.data.title, href: `/projects/${entry.id}/` }));

  // 随机漫游的目标 = 文章 + 项目的站内路径
  const randomTargets = [
    ...articles.map((item) => item.href),
    ...projects.map((item) => item.href),
  ];

  const payload = {
    pages: siteConfig.ui.commandPalette.pages,
    articles,
    projects,
    randomTargets,
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 清单随内容发布变化，交给 CDN 短缓存 + ETag 协商即可
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
