import adminData from '../data/admin.json';
import aboutData from '../data/about.json';
import articlesData from '../data/articles.json';
import chromeData from '../data/chrome.json';
import discoveryData from '../data/discovery.json';
import homeData from '../data/home.json';
import projectsData from '../data/projects.json';
import siteData from '../data/site.json';
import { siteSchema } from '../lib/site-schema';
import { z } from 'astro/zod';

/**
 * 站点配置按模块拆成多份后台文件，避免「站点信息」单页字段过长；
 * 这里合并回单一视图，页面组件仍只认 siteConfig，且构建期统一用 zod 校验。
 */
export const siteConfig = (() => {
  try {
    return siteSchema.parse({
      ...siteData,
      ...chromeData,
      ...homeData,
      ...aboutData,
      ...articlesData,
      ...projectsData,
      ...discoveryData,
      ...adminData,
    });
  } catch (error) {
    const detail = error instanceof z.ZodError
      ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')
      : String(error);
    throw new Error(`站点信息模块校验失败：${detail}`, { cause: error });
  }
})();

export type SiteConfig = typeof siteConfig;
