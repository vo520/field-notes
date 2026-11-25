import siteData from '../data/site.json';
import { siteSchema } from '../lib/site-schema';

/** 站点身份配置，唯一数据源是 src/data/site.json（后台可编辑），构建期用 zod 校验 */
export const siteConfig = siteSchema.parse(siteData);

export type SiteConfig = typeof siteConfig;
