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
