import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

import { baseFields, omitEmpty, projectSchema, stringList } from './lib/project-schema';

export const articleSchema = z.object({
  ...baseFields,
  // 文章所属项目的 slug（可选）：单一事实源只写在文章侧，项目页反查文章，
  // 避免两边各存一份关联后改一处漏一处。空串/null 由 CMS 归一为未提供。
  project: omitEmpty(z.string().optional()),
  tags: omitEmpty(stringList().default([])),
  cover: omitEmpty(z.string().optional()),
  // 阅读组织：章节决定分组、order 决定组内真实阅读顺序。
  // 章节短名是否有效由 articles.json 的 chapters 清单在构建期判定（与项目分类同一口径），
  // 后台写错时只是落到「未分组」并告警，不让单条内容打挂整站构建。
  chapter: omitEmpty(z.string().optional()),
  order: omitEmpty(z.coerce.number().int().positive().optional()),
  level: omitEmpty(z.enum(['intro', 'deep', 'practice']).optional()),
});

const articles = defineCollection({
  loader: glob({ base: './src/content/articles', pattern: '**/*.{md,mdx}' }),
  schema: articleSchema,
});

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
  schema: projectSchema,
});

export const collections = { articles, projects };

export type ArticleData = z.infer<typeof articleSchema>;
export { projectSchema } from './lib/project-schema';
export type { ProjectData } from './lib/project-schema';
