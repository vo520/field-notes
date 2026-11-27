import { projectCategories } from './projects';
import {
  getProjectPublishingIssues,
  isDraftFlag,
  type ProjectPublishingRuleInput,
} from './publishing-rules';
import { toTagSlug } from './slug.ts';

// 保留既有导出路径：标签组件与各页面仍从 content 取该函数，实际实现收敛在 slug.ts
export { toTagSlug };

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

/**
 * 粗估正文字数（站内展示口径统一：文章页 meta、JSON-LD wordCount、关于页统计共用）。
 * 剔除代码块与行内代码，链接只计锚文本，中文按字、西文按词。
 */
export function estimateWordCount(body: string): number {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return cjk + latin;
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

  const issues = getProjectPublishingIssues(entry.data, { categories: projectCategories });
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
  const currentCategory = current.data.category ? toTagSlug(current.data.category) : '';

  const scored = entries
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => {
      let score = 0;
      const cTags = new Set((candidate.data.tags ?? []).map(toTagSlug));
      const cTech = new Set((candidate.data.tech ?? []).map(toTagSlug));

      for (const tag of cTags) if (currentTags.has(tag)) score += 2;
      for (const tech of cTech) if (currentTech.has(tech)) score += 1;
      // 分类同口径：Web / web 视为同一业务场景
      if (currentCategory && candidate.data.category && toTagSlug(candidate.data.category) === currentCategory) score += 1;

      return { candidate, score };
    })
    .filter((item) => item.score > 0)
    // 同分时发布时间近的优先：文章没有 tech 维度，重合标签数打平后用时效性做最后一级权重
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aAt = (a.candidate.data as { publishedAt?: Date }).publishedAt?.getTime() ?? 0;
      const bAt = (b.candidate.data as { publishedAt?: Date }).publishedAt?.getTime() ?? 0;
      return bAt - aAt;
    })
    .map((item) => item.candidate);

  return scored.slice(0, topN);
}

interface ProjectLinked {
  data: {
    project?: string | undefined;
  };
}

/**
 * 文章 → 项目的唯一口径：与标签页共用 toTagSlug，后台写错大小写或带空格也能匹配到项目 id。
 * 未填写时返回 undefined，独立笔记不需要关联项目。
 */
export function getArticleProjectSlug(article: ProjectLinked): string | undefined {
  const value = article.data.project;
  if (!value || value.trim() === '') return undefined;
  return toTagSlug(value);
}

/** 在传入的项目池里查文章声明的项目；调用方负责只传生产可发布的项目 */
export function findArticleProject<T extends { id: string }>(
  article: ProjectLinked,
  projects: readonly T[],
): T | undefined {
  const slug = getArticleProjectSlug(article);
  if (!slug) return undefined;
  return projects.find((project) => toTagSlug(project.id) === slug);
}

/** 项目 → 文章的反向索引：项目侧不存字段，直接按文章的声明筛选，避免双向维护漂移 */
export function getArticlesForProject<T extends ProjectLinked>(
  articles: readonly T[],
  projectId: string,
): T[] {
  const slug = toTagSlug(projectId);
  return articles.filter((article) => getArticleProjectSlug(article) === slug);
}

/** 构建期一致性检查：引用了不存在或未发布的项目时给出可定位的原因 */
export function getArticleProjectIssue(
  article: ProjectLinked,
  publishedProjectIds: ReadonlySet<string>,
): string | undefined {
  const slug = getArticleProjectSlug(article);
  if (!slug) return undefined;
  return publishedProjectIds.has(slug) ? undefined : `project: 关联项目 "${slug}" 不存在或未发布`;
}

interface SeriesProject {
  id: string;
  data: { title: string };
}

/** 章节清单来自 articles.json（后台可改顺序与文案），slug 是文章的匹配键 */
export interface ArticleChapter {
  slug: string;
  title: string;
  description?: string;
}

interface ChapterLinked {
  data: {
    chapter?: string | undefined;
    order?: number | undefined;
  };
}

export interface ArticleSection<T> {
  key: string;
  title: string;
  description?: string | undefined;
  articles: T[];
}

export interface ArticleSeries<T> {
  key: string;
  title: string;
  project: SeriesProject | undefined;
  /** 扁平阅读顺序：章节顺序 + 章节内 order，供上下篇与相关推荐使用 */
  articles: T[];
  /** 按章节切分的分组，供列表页与项目页目录使用 */
  sections: ArticleSection<T>[];
}

/** 后台清空章节时写成空串，和项目 slug 共用同一套「未提供」口径 */
export function getArticleChapterSlug(article: ChapterLinked): string | undefined {
  const value = article.data.chapter;
  if (!value || value.trim() === '') return undefined;
  return toTagSlug(value);
}

/**
 * 阅读顺序的唯一口径：章节顺序在前，章节内按 order 升序。
 * 未填章节或 order 的条目排到末尾，再按发布时间与 id 兜底，保证构建输出稳定。
 */
export function sortArticlesForReading<T extends ChapterLinked & DatedEntry>(
  entries: readonly T[],
  chapters: readonly ArticleChapter[] = [],
): T[] {
  const chapterIndex = new Map(chapters.map((chapter, index) => [chapter.slug, index]));
  const fallback = chapters.length;

  return [...entries].sort((left, right) => {
    const leftChapter = getArticleChapterSlug(left);
    const rightChapter = getArticleChapterSlug(right);
    const leftIndex = leftChapter ? (chapterIndex.get(leftChapter) ?? fallback) : fallback;
    const rightIndex = rightChapter ? (chapterIndex.get(rightChapter) ?? fallback) : fallback;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;

    const leftOrder = left.data.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.data.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    const byDate = left.data.publishedAt.getTime() - right.data.publishedAt.getTime();
    if (byDate !== 0) return byDate;
    return (left.id ?? '').localeCompare(right.id ?? '');
  });
}

export function buildArticleSections<T extends ChapterLinked & DatedEntry>(
  entries: readonly T[],
  chapters: readonly ArticleChapter[],
  uncategorizedTitle: string,
): ArticleSection<T>[] {
  // 没有章节清单时退化为「一组按阅读顺序排列」，保持旧调用与新逻辑同一口径
  if (chapters.length === 0) {
    return [{ key: 'all', title: uncategorizedTitle, articles: sortArticlesForReading(entries) }];
  }

  const bySlug = new Map<string, T[]>();
  const unknown: T[] = [];
  const known = new Set(chapters.map((chapter) => toTagSlug(chapter.slug)));

  for (const entry of entries) {
    const slug = getArticleChapterSlug(entry);
    if (!slug || !known.has(slug)) {
      unknown.push(entry);
      continue;
    }
    const bucket = bySlug.get(slug);
    if (bucket) bucket.push(entry);
    else bySlug.set(slug, [entry]);
  }

  const sections = chapters
    .filter((chapter) => bySlug.has(toTagSlug(chapter.slug)))
    .map((chapter) => {
      const slug = toTagSlug(chapter.slug);
      return {
        key: slug,
        title: chapter.title,
        ...(chapter.description ? { description: chapter.description } : {}),
        articles: sortArticlesForReading(bySlug.get(slug)!, chapters),
      };
    });

  if (unknown.length > 0) {
    sections.push({
      key: 'uncategorized',
      title: uncategorizedTitle,
      articles: sortArticlesForReading(unknown, chapters),
    });
  }

  return sections;
}

/**
 * 按 project 聚成系列：项目标题即系列名，项目页即系列入口。
 * 系列内再用 chapters 切成章节：同一天发布的文章靠 order 得到真实阅读顺序，
 * 不再退化为文件名字母序。组间按各自最新一篇倒序，无项目的文章归到末尾独立组。
 */
export function groupArticlesIntoSeries<T extends ProjectLinked & DatedEntry & ChapterLinked>(
  articles: readonly T[],
  projects: readonly SeriesProject[],
  standaloneTitle: string,
  chapters: readonly ArticleChapter[] = [],
  uncategorizedTitle = '未分组章节',
): ArticleSeries<T>[] {
  const projectBySlug = new Map(projects.map((project) => [toTagSlug(project.id), project]));
  const grouped = new Map<string, T[]>();
  const standalone: T[] = [];

  for (const article of articles) {
    const slug = getArticleProjectSlug(article);
    if (!slug || !projectBySlug.has(slug)) {
      standalone.push(article);
      continue;
    }
    const bucket = grouped.get(slug);
    if (bucket) bucket.push(article);
    else grouped.set(slug, [article]);
  }

  const series: ArticleSeries<T>[] = [...grouped.entries()].map(([slug, entries]) => {
    const project = projectBySlug.get(slug)!;
    const sections = buildArticleSections(entries, chapters, uncategorizedTitle);
    return {
      key: slug,
      title: project.data.title,
      project,
      articles: sections.flatMap((section) => section.articles),
      sections,
    };
  });
  series.sort((left, right) => {
    const leftLatest = left.articles[left.articles.length - 1]!.data.publishedAt.getTime();
    const rightLatest = right.articles[right.articles.length - 1]!.data.publishedAt.getTime();
    return rightLatest - leftLatest;
  });

  if (standalone.length > 0) {
    const sections = buildArticleSections(standalone, chapters, uncategorizedTitle);
    series.push({
      key: 'standalone',
      title: standaloneTitle,
      project: undefined,
      articles: sections.flatMap((section) => section.articles),
      sections,
    });
  }

  return series;
}

/** 系列内相邻两篇：上一篇按正序向前取，下一篇向后取；边界处返回 undefined */
export function getSeriesNeighbors<T extends { id: string }>(
  series: readonly T[],
  currentId: string,
): { previous?: T | undefined; next?: T | undefined } {
  const index = series.findIndex((entry) => entry.id === currentId);
  if (index < 0) return {};
  return {
    ...(index > 0 ? { previous: series[index - 1] } : {}),
    ...(index < series.length - 1 ? { next: series[index + 1] } : {}),
  };
}

/**
 * 文章翻页的唯一口径。系列文章只在系列内翻，边界处不回退到全站：
 * 全站是发布时间倒序、系列是阅读正序，混用会让首篇的上下篇指向同一篇、
 * 末篇跳到别的系列。只有独立文章才沿用全站时间序。
 * allArticles 须为全站倒序，seriesArticles 须为系列正序。
 */
export function getArticlePager<T extends { id: string }>(
  allArticles: readonly T[],
  seriesArticles: readonly T[] | undefined,
  currentId: string,
): { previous?: T | undefined; next?: T | undefined } {
  if (seriesArticles && seriesArticles.length > 0) {
    return getSeriesNeighbors(seriesArticles, currentId);
  }

  const index = allArticles.findIndex((entry) => entry.id === currentId);
  if (index < 0) return {};
  return {
    ...(allArticles[index + 1] ? { previous: allArticles[index + 1] } : {}),
    ...(index > 0 && allArticles[index - 1] ? { next: allArticles[index - 1] } : {}),
  };
}

/**
 * 「继续阅读」的唯一口径：同系列按与当前篇的距离排序（相邻优先、同距离取较早的一篇），
 * 标签推荐只用于补齐空位。独立文章没有系列邻居，全部由标签推荐产生。
 */
export function getSeriesAwareRelated<T extends Taggable>(
  allArticles: readonly T[],
  seriesArticles: readonly T[] | undefined,
  current: T,
  topN = 3,
): T[] {
  const currentIndex = seriesArticles?.findIndex((entry) => entry.id === current.id) ?? -1;
  const siblings = currentIndex >= 0 && seriesArticles
    ? seriesArticles
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.id !== current.id)
        .sort((a, b) =>
          Math.abs(a.index - currentIndex) - Math.abs(b.index - currentIndex) || a.index - b.index,
        )
        .map(({ entry }) => entry)
    : [];
  const tagged = getRelatedByTags(allArticles, current, topN).filter(
    (entry) => !siblings.some((sibling) => sibling.id === entry.id),
  );

  return [...siblings, ...tagged].slice(0, topN);
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
