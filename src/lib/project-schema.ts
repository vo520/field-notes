import { z } from 'astro/zod';

import { projectCategories } from './projects';

export const projectRepositoryRoles = ['frontend', 'admin', 'backend', 'content'] as const;

export type ProjectRepositoryRole = typeof projectRepositoryRoles[number];

/** 后台把未填写的可选项写成空数组或空字符串时，按「未提供」处理 */
export const omitEmpty = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === '' || (Array.isArray(value) && value.length === 0) ? undefined : value),
    schema,
  );

const baseFields = {
  title: z.string().min(1),
  description: z.string().min(1),
  publishedAt: z.coerce.date(),
  updatedAt: omitEmpty(z.coerce.date().optional()),
  draft: z.boolean().default(false),
  featured: z.boolean().default(false),
};

const projectScreenshotSchema = z.object({
  src: z.string().startsWith('/'),
  alt: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().min(1),
  viewport: z.enum(['desktop', 'mobile']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const projectCapabilitySchema = z.object({
  modules: omitEmpty(z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    features: z.array(z.string().min(1)).min(1),
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
  integrations: omitEmpty(z.array(z.string().min(1)).min(1).optional()),
});

export const projectSchema = z.object({
  ...baseFields,
  status: z.enum(['active', 'completed', 'archived']),
  category: z.enum(projectCategories),
  tech: z.array(z.string().min(1)).default([]),
  cover: omitEmpty(z.string().startsWith('/').optional()),
  screenshots: omitEmpty(z.array(projectScreenshotSchema).min(4).max(6).optional()),
  ...projectCapabilitySchema.shape,
  demoUrl: omitEmpty(z.url().refine((url) => /^https?:\/\//.test(url), {
    message: '演示地址必须是 http(s) 链接',
  }).optional()),
  repoUrl: omitEmpty(z.url().refine((url) => /^https?:\/\//.test(url), {
    message: '源码地址必须是 http(s) 链接',
  }).optional()),
  repoLabel: omitEmpty(z.string().min(1).optional()),
  sourceVisibility: z.enum(['public', 'private']).default('public'),
  repositories: z.array(z.object({
    name: z.string().min(1),
    role: z.enum(projectRepositoryRoles),
    description: z.string().min(1),
    tech: z.array(z.string().min(1)).min(1),
    url: z.url().refine((url) => /^https:\/\/(?:github|gitee)\.com\//.test(url), {
      message: '仓库地址必须是 GitHub 或 Gitee 的 HTTPS 链接',
    }),
  })).optional(),
}).superRefine((project, context) => {
  if (project.draft) return;

  if (!project.cover) {
    context.addIssue({
      code: 'custom',
      path: ['cover'],
      message: '公开项目必须提供仓库内封面',
    });
  }

  if (project.sourceVisibility === 'public' && !project.repoUrl) {
    context.addIssue({
      code: 'custom',
      path: ['repoUrl'],
      message: '公开源码项目必须提供源码地址',
    });
  }

  if (project.sourceVisibility === 'private' && project.repoUrl) {
    context.addIssue({
      code: 'custom',
      path: ['repoUrl'],
      message: '私有项目不能提供公开源码地址',
    });
  }
});

export type ProjectData = z.infer<typeof projectSchema>;
