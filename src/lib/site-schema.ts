import { z } from 'astro/zod';

/** 后台清空可选链接时会写成空字符串，这里统一按「未填」处理 */
const optionalUrl = z.preprocess(
  (value) => (value === null || value === undefined ? '' : value),
  z.string().refine((value) => value === '' || /^https?:\/\/\S+$/.test(value), {
    message: '必须是 http(s) 链接',
  }),
);

export const siteSchema = z.object({
  name: z.string().min(1),
  brand: z.string().min(1),
  brandMark: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  author: z.object({
    name: z.string().min(1),
    role: z.string().min(1),
    bio: z.string().min(1),
  }),
  social: z.object({
    github: optionalUrl,
    gitee: optionalUrl,
    email: z.preprocess((value) => (value === null || value === undefined ? '' : value), z.string()),
  }),
  nav: z.array(z.object({
    href: z.string().startsWith('/'),
    label: z.string().min(1),
  })).min(1),
});

export type SiteConfig = z.infer<typeof siteSchema>;
