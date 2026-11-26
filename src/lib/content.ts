import {
  getProjectPublishingIssues,
  isDraftFlag,
  type ProjectPublishingRuleInput,
} from './publishing-rules';

interface DatedEntry {
  data: {
    publishedAt: Date;
  };
  id?: string;
}

interface DraftEntry {
  data: {
    draft: boolean;
  };
}

export function estimateReadingTime(body: string): number {
  const chineseCharacters = body.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinWords = body.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  const minutes = chineseCharacters / 300 + latinWords / 200;

  return Math.max(1, Math.ceil(minutes));
}

export function sortByPublishedAt<T extends DatedEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((left, right) => {
    const diff = right.data.publishedAt.getTime() - left.data.publishedAt.getTime();
    if (diff !== 0) return diff;

    const leftId = left.id ?? '';
    const rightId = right.id ?? '';
    return leftId.localeCompare(rightId);
  });
}

export function isVisibleEntry<T extends DraftEntry>(entry: T, isProduction: boolean): boolean {
  return !isProduction || !entry.data.draft;
}

const warnedProjects = new Set<string>();

/**
 * 项目发布闸门：草稿和违反发布红线的项目一律不进入生产产物。
 * 后台无法在保存时拦截跨字段组合，这里用「拒绝发布 + 构建警告」替代「整站构建失败」。
 * 开发环境保留预览，方便在本地看到并修复问题条目。
 */
export function isPublishedProject(
  entry: { id: string; data: ProjectPublishingRuleInput },
  isProduction: boolean,
): boolean {
  if (!isProduction) return true;
  if (isDraftFlag(entry.data.draft)) return false;

  const issues = getProjectPublishingIssues(entry.data);
  if (issues.length === 0) return true;

  if (!warnedProjects.has(entry.id)) {
    warnedProjects.add(entry.id);
    const reasons = issues.map((issue) => `${issue.path}: ${issue.message}`).join('；');
    console.warn(`[projects] 已跳过不符合发布规则的项目 "${entry.id}"：${reasons}`);
  }

  return false;
}

interface Taggable {
  data: {
    tags?: readonly string[];
    tech?: readonly string[];
    category?: string;
  };
  id: string;
}

export function getRelatedByTags<T extends Taggable>(entries: readonly T[], current: T, topN = 3): T[] {
  // 标签比对必须与标签页共用同一套 slug 口径，否则「API / 设计」与「API 设计」
  // 在标签页被合并成一页，却在这里被判为不同标签，推荐结果与归档页自相矛盾。
  const currentTags = new Set((current.data.tags ?? []).map(toTagSlug));
  const currentTech = new Set((current.data.tech ?? []).map(toTagSlug));
  const currentCategory = current.data.category ?? '';

  const scored = entries
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => {
      let score = 0;
      const cTags = new Set((candidate.data.tags ?? []).map(toTagSlug));
      const cTech = new Set((candidate.data.tech ?? []).map(toTagSlug));

      for (const tag of cTags) if (currentTags.has(tag)) score += 2;
      for (const tech of cTech) if (currentTech.has(tech)) score += 1;
      if (currentCategory && candidate.data.category === currentCategory) score += 1;

      return { candidate, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.candidate);

  return scored.slice(0, topN);
}

export function toTagSlug(tag: string): string {
  const slug = tag
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\\/?#%&+]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // 纯标点 tag 归一化后为空，回落到固定 slug，避免生成 /tags// 这类无效路径
  return slug || 'tag';
}

interface SlugGroup<T> {
  slug: string;
  label: string;
  entries: T[];
}

/**
 * 按归一化后的 slug 聚合条目（标签、分类共用）。
 * 调用方须按发布时间倒序传入：label 取最新条目里的写法，与详情页一致；
 * 同一条目内归一化后重复的值只计一次，避免总览页数量与详情页列表对不上。
 */
export function groupBySlug<T>(entries: readonly T[], getLabels: (entry: T) => readonly string[]): SlugGroup<T>[] {
  const groups = new Map<string, SlugGroup<T>>();

  for (const entry of entries) {
    const seen = new Set<string>();
    for (const label of getLabels(entry)) {
      const slug = toTagSlug(label);
      if (seen.has(slug)) continue;
      seen.add(slug);

      const group = groups.get(slug);
      if (group) group.entries.push(entry);
      else groups.set(slug, { slug, label, entries: [entry] });
    }
  }

  return [...groups.values()];
}
