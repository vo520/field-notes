import { describe, expect, it } from 'vitest';

import { collectStacks, findStack } from '../src/lib/stacks';

describe('技术栈聚合', () => {
  const projects = [
    { id: 'p1', data: { tech: ['Vue 3', 'TypeScript'] } },
    { id: 'p2', data: { tech: ['vue 3', 'PHP'] } },
    { id: 'p3', data: { tech: [] } },
  ];
  const articles = [
    { id: 'a1', data: { tags: ['Vue 3', '工程实践'] } },
    { id: 'a2', data: { tags: ['TypeScript'] } },
  ];

  it('merges project tech and article tags into one ranked list', () => {
    const stacks = collectStacks(projects, articles);

    // Vue 3 归一后 vue-3：2 个项目 + 1 篇文章 = 3
    // 同数按 localeCompare('zh-CN') 排，PHP 在「工程实践」之后，与图谱页排序一致
    expect(stacks.map(({ slug, total }) => [slug, total])).toEqual([
      ['vue-3', 3],
      ['typescript', 2],
      ['工程实践', 1],
      ['php', 1],
    ]);
  });

  it('keeps the first display label for a slug and exposes member ids', () => {
    const vue = collectStacks(projects, articles).find((stack) => stack.slug === 'vue-3');

    expect(vue?.label).toBe('Vue 3');
    expect(vue?.projects.map((project) => project.id)).toEqual(['p1', 'p2']);
    expect(vue?.articles.map((article) => article.id)).toEqual(['a1']);
  });

  it('finds a stack by normalized slug and misses unknown ones', () => {
    const stacks = collectStacks(projects, articles);

    expect(findStack(stacks, 'VUE 3')?.slug).toBe('vue-3');
    expect(findStack(stacks, '不存在')).toBeUndefined();
  });
});
