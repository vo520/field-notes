import { getProjectPublishingIssues, type ProjectData } from './project-schema';

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
  entry: { id: string; data: ProjectData },
  isProduction: boolean,
): boolean {
  if (!isProduction) return true;
  if (entry.data.draft) return false;

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
  const currentTags = new Set((current.data.tags ?? []).map(normalize));
  const currentTech = new Set((current.data.tech ?? []).map(normalize));
  const currentCategory = current.data.category ?? '';

  const scored = entries
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => {
      let score = 0;
      const cTags = (candidate.data.tags ?? []).map(normalize);
      const cTech = (candidate.data.tech ?? []).map(normalize);

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

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
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
