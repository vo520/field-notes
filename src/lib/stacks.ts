import { toTagSlug } from './slug';

/**
 * 技术栈图谱与专题页的唯一聚合口径：项目 tech 与文章 tags 按 toTagSlug 合并，
 * 每项的 slug 直接作为 /stacks/{slug}/ 的路由键，label 取首次出现的技术写法。
 * 入参须已过滤草稿/未发布内容，避免泄漏到静态产物。
 */
export interface StackEntry<TProject, TArticle> {
  slug: string;
  label: string;
  projects: TProject[];
  articles: TArticle[];
  total: number;
}

interface TechTagged {
  data: { tech?: readonly string[] | undefined };
}

interface TagTagged {
  data: { tags?: readonly string[] | undefined };
}

export function collectStacks<
  TProject extends TechTagged,
  TArticle extends TagTagged,
>(projects: readonly TProject[], articles: readonly TArticle[]): StackEntry<TProject, TArticle>[] {
  const groups = new Map<string, StackEntry<TProject, TArticle>>();

  const add = (label: string, entry: { project?: TProject; article?: TArticle }) => {
    const slug = toTagSlug(label);
    if (!slug) return;
    let group = groups.get(slug);
    if (!group) {
      group = { slug, label, projects: [], articles: [], total: 0 };
      groups.set(slug, group);
    }
    if (entry.project) group.projects.push(entry.project);
    if (entry.article) group.articles.push(entry.article);
    group.total = group.projects.length + group.articles.length;
  };

  for (const project of projects) {
    // 同一项目里写了 Vue 3 与 vue3 时只归一次，避免专题页重复列出同一项目
    const seen = new Set<string>();
    for (const tech of project.data.tech ?? []) {
      const slug = toTagSlug(tech);
      if (seen.has(slug)) continue;
      seen.add(slug);
      add(tech, { project });
    }
  }
  for (const article of articles) {
    const seen = new Set<string>();
    for (const tag of article.data.tags ?? []) {
      const slug = toTagSlug(tag);
      if (seen.has(slug)) continue;
      seen.add(slug);
      add(tag, { article });
    }
  }

  return [...groups.values()]
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label, 'zh-CN'));
}

/** URL 上的 slug 必须是已聚合的键，否则生成不出对应专题页 */
export function findStack<TProject, TArticle>(
  stacks: readonly StackEntry<TProject, TArticle>[],
  slug: string,
): StackEntry<TProject, TArticle> | undefined {
  const normalized = toTagSlug(slug);
  return stacks.find((stack) => stack.slug === normalized);
}
