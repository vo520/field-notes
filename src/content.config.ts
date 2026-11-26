import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

import { baseFields, omitEmpty, projectSchema } from './lib/project-schema';

export const articleSchema = z.object({
  ...baseFields,
  tags: omitEmpty(z.array(z.string().min(1)).default([])),
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
