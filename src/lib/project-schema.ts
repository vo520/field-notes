import { z } from 'astro/zod';

import { readPublicImageSize } from './image-size';

export const projectRepositoryRoles = ['frontend', 'admin', 'backend', 'content'] as const;

export type ProjectRepositoryRole = typeof projectRepositoryRoles[number];

/** 公开源码入口只允许 GitHub / Gitee，单仓与多仓共用同一判据 */
export const repositoryUrlPattern = /^https:\/\/(?:github|gitee)\.com\//;

/** 后台把未填写的可选项写成空数组、空字符串或 null 时，按「未提供」处理；只含空白项的数组同样视为未填写 */
export const omitEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (
      value === ''
      || value === null
      || (Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim() === ''))
        ? undefined
        : value
    ),
    schema,
  );

/** 后台 list 控件可能把没填的空行一起保存成 ""，先剔除空白项再校验，避免整站构建失败 */
export const stringList = (min = 0) =>
  z.preprocess(
    (value) => (Array.isArray(value) ? value.filter((item) => typeof item !== 'string' || item.trim() !== '') : value),
    z.array(z.string().min(1)).min(min),
  );

const isHttpsUrl = (url: string) => url.startsWith('https://');

/**
 * 后台的 pattern 只能做前缀匹配，`https://`、`https://a b` 这类值能保存却无法通过 z.url()。
 * 这里把「不是合法链接」或「不满足来源限制」的值归一为「未提供」：
 * repoUrl 归一后由发布闸门判定（公开项目会被跳过并输出警告），demoUrl 归一后只是不展示链接，
 * 两者都不会让后台输入把整站构建打挂。
 */
const optionalLink = (accepts: (url: string) => boolean) =>
  z.preprocess(
    (value) => (typeof value === 'string' && !(z.url().safeParse(value).success && accepts(value)) ? undefined : value),
    z.url().optional(),
  );

/**
 * 布尔字段容错：手写 YAML 常见 `True` / `TRUE`，CMS 也可能写成字符串。
 * 归一规则与 scripts/generate-og.mjs 的草稿判断保持一致（只认大小写无关的 true/false），
 * 其他值仍判非法，避免把拼错的字段静默当成 false。
 */
const looseBoolean = z.preprocess(
  (value) => {
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return value;
  },
  z.boolean().default(false),
);

export const baseFields = {
  title: z.string().min(1),
  description: z.string().min(1),
  publishedAt: z.coerce.date(),
  updatedAt: omitEmpty(z.coerce.date().optional()),
  draft: looseBoolean,
  featured: looseBoolean,
};

/**
 * 截图宽高以图片实际像素为准：后台换图后不必再手改数字，避免宽高填错导致 npm test 失败、部署被阻断。
 * 读不到文件（单测里的占位路径、无法识别的格式）时保留后台填写的值，仍由下方 z.number() 校验。
 */
const withActualScreenshotSize = (value: unknown) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;

  const { src } = value as { src?: unknown };
  if (typeof src !== 'string') return value;

  const size = readPublicImageSize(src);
  return size ? { ...(value as Record<string, unknown>), ...size } : value;
};

const projectScreenshotSchema = z.preprocess(withActualScreenshotSize, z.object({
  src: z.string().startsWith('/'),
  alt: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().min(1),
  viewport: z.enum(['desktop', 'mobile']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}));

const projectCapabilitySchema = z.object({
  modules: omitEmpty(z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    features: stringList(),
  })).min(1).optional()),
  roles: omitEmpty(z.array(z.object({
    name: z.string().min(1),
    scope: z.string().min(1),
  })).min(1).optional()),
  workflow: omitEmpty(z.array(z.object({
    label: z.string().min(1),
    status: z.string().min(1),
  })).min(1).optional()),
  metrics: omitEmpty(z.array(z.object({
    label: z.string().min(1),
    value: z.string().min(1),
    trend: z.string().min(1),
  })).min(1).optional()),
  integrations: omitEmpty(stringList(1).optional()),
});

export const projectSchema = z.object({
  ...baseFields,
  status: z.enum(['active', 'completed', 'archived']),
  // 分类清单在 projects.json 里由后台维护，这里只保证非空；
  // 是否属于清单由发布闸门判定（改分类名时不该让整站构建失败）。
  // 后台保存校验会先去掉首尾空格再比对清单，构建期同步处理，
  // 避免「保存能通过、构建却按未知分类跳过项目」；全空白不在这里抛错，
  // 否则单条内容就能把整站构建打挂，保留原值交由发布闸门跳过该项目。
  category: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || value : value),
    z.string().min(1),
  ),
  tech: omitEmpty(stringList().default([])),
  cover: omitEmpty(z.string().startsWith('/').optional()),
  // 只需限制上限：后台可以留空或先传 1–3 张，少于 4 张不该让整站构建失败
  screenshots: omitEmpty(z.array(projectScreenshotSchema).max(6).optional()),
  ...projectCapabilitySchema.shape,
  demoUrl: omitEmpty(optionalLink(isHttpsUrl)),
  repoUrl: omitEmpty(optionalLink((url) => repositoryUrlPattern.test(url))),
  repoLabel: omitEmpty(z.string().min(1).optional()),
  sourceVisibility: omitEmpty(z.enum(['public', 'private']).default('public')),
  repositories: omitEmpty(z.array(z.object({
    name: z.string().min(1),
    role: z.enum(projectRepositoryRoles),
    description: z.string().min(1),
    tech: stringList(),
    url: z.url().refine((url) => repositoryUrlPattern.test(url), {
      message: '仓库地址必须是 GitHub 或 Gitee 的 HTTPS 链接',
    }),
  })).optional()),
});

export type ProjectData = z.infer<typeof projectSchema>;

/**
 * 发布红线判定抽到 publishing-rules.ts（零依赖）：OG 图生成脚本在纯 Node 下
 * 无法加载带 zod 的 schema 模块，这里 re-export 保持既有消费方 import 路径不变。
 */
export {
  getProjectPublishingIssues,
  isPublishableProject,
  type ProjectPublishingIssue,
  type ProjectPublishingIssuePath,
} from './publishing-rules';
