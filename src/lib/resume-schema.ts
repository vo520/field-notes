import { z } from 'astro/zod';

/** 与 site-schema 保持同一约定：后台 list 的空行先剔除，再校验非空文案 */
const text = z.string().min(1);
const copyList = () =>
  z.preprocess(
    (value) =>
      Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => item !== '')
        : value,
    z.array(text),
  );

/**
 * 简历内容独立于站点身份：后台改写 /resume/ 时不会再碰到 site.json，
 * 避免两个 CMS 文件同时写一份数据造成互相覆盖。
 */
export const resumeSchema = z.object({
  seoDescription: text,
  intro: z.object({
    eyebrow: text,
    title: text,
    summary: text,
  }),
  facts: z.array(z.object({ label: text, value: text })).min(1),
  highlights: z.array(z.object({ title: text, description: text })).min(1),
  stackGroups: z.array(z.object({
    label: text,
    items: copyList(),
  })).min(1),
  projectExperiences: z.array(z.object({
    slug: text.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '项目 slug 只能是小写英文、数字与连字符'),
    contribution: text,
  })).min(1),
  statLabels: z.object({
    projects: text,
    categories: text,
    experiences: text,
  }),
  workHistory: z.array(z.object({
    company: text,
    role: text,
    team: text,
    period: text,
    summary: text,
    points: copyList(),
  })).min(1),
  education: z.object({
    school: text,
    detail: text,
  }),
  workflow: z.array(z.object({ title: text, description: text })).min(1),
  contactHeading: text,
});

export type ResumeConfig = z.infer<typeof resumeSchema>;
