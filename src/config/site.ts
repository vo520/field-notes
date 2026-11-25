import siteData from '../data/site.json';
import { siteSchema } from '../lib/site-schema';
import { z } from 'astro/zod';

/** 站点身份配置，唯一数据源是 src/data/site.json（后台可编辑），构建期用 zod 校验 */
export const siteConfig = (() => {
  try {
    return siteSchema.parse(siteData);
  } catch (error) {
    const detail = error instanceof z.ZodError
      ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')
      : String(error);
    throw new Error(`src/data/site.json 校验失败：${detail}`, { cause: error });
  }
})();

export type SiteConfig = typeof siteConfig;
