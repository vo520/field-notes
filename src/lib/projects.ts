import projectsData from '../data/projects.json';
import { normalizeCategories } from './project-category-guard';
import { toTagSlug } from './slug';

/**
 * 项目分类清单的唯一数据源是 src/data/projects.json 的 projectsPage.categories，
 * 后台可在「项目页配置 → 项目分类清单」增删改，顺序即筛选条顺序。
 * 这里只读原始 JSON、不经过 zod，避免把整站配置解析带进浏览器端脚本。
 *
 * 后台的 list 控件不禁止空行与重复项，直接渲染会让筛选条出现空白按钮或两个同名按钮，
 * 因此统一走 normalizeCategories 清洗（与后台保存时的校验共用同一规则）。
 */
export const projectCategories: readonly string[] = normalizeCategories(
  projectsData.projectsPage.categories,
);
export const ALL_PROJECT_CATEGORIES = '全部';

export type ProjectCategory = string;
export type ProjectCategoryFilter = typeof ALL_PROJECT_CATEGORIES | ProjectCategory;

function buildCategoryCounts<T extends { data: { category: ProjectCategory } }>(
  projects: readonly T[],
): ReadonlyMap<string, number> {
  // 计数口径与分类页、发布闸门一致（toTagSlug）：Web / web 属于同一分类，
  // 否则清单写 Web、项目写 web 时筛选条会显示 0，点进去却能看到该项目。
  const counts = new Map<string, number>();
  for (const project of projects) {
    const slug = toTagSlug(project.data.category ?? '');
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}

export function getProjectCategoryStats<T extends { data: { category: ProjectCategory } }>(
  projects: readonly T[],
): Array<{ category: ProjectCategory; count: number }> {
  const counts = buildCategoryCounts(projects);
  return projectCategories.map((category) => ({
    category,
    count: counts.get(toTagSlug(category)) ?? 0,
  }));
}

export function parseProjectCategory(value: string | null): ProjectCategoryFilter {
  if (value === null) return ALL_PROJECT_CATEGORIES;
  // URL 里的写法可能和清单大小写不同，按 slug 回落到清单中的显示名
  const slug = toTagSlug(value);
  return projectCategories.find((category) => toTagSlug(category) === slug) ?? ALL_PROJECT_CATEGORIES;
}

export function getProjectCategoryUrl(
  currentUrl: string,
  filter: ProjectCategoryFilter,
): string {
  const url = new URL(currentUrl);

  if (filter === ALL_PROJECT_CATEGORIES) {
    url.searchParams.delete('category');
  } else {
    url.searchParams.set('category', filter);
  }

  return url.toString();
}

export type ProjectStatus = 'active' | 'completed' | 'archived';

interface TechCountProject {
  data: { tech?: readonly string[] | undefined };
}

/** 项目技术栈统计：按 toTagSlug 归一，与标签页/技术栈图谱同口径，按使用数降序、同数按显示名排序 */
export function getProjectTechStats<T extends TechCountProject>(
  projects: readonly T[],
): Array<{ slug: string; label: string; count: number }> {
  const grouped = new Map<string, { label: string; count: number }>();
  for (const project of projects) {
    for (const tech of project.data.tech ?? []) {
      const slug = toTagSlug(tech);
      if (!slug) continue;
      const entry = grouped.get(slug);
      if (entry) entry.count += 1;
      else grouped.set(slug, { label: tech, count: 1 });
    }
  }
  return [...grouped.entries()]
    .map(([slug, { label, count }]) => ({ slug, label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'));
}

interface StatusCountProject {
  data: { status: ProjectStatus };
}

/** 项目状态统计返回全量三态，后台/内容缺某态时筛选条仍完整（计数为 0） */
export function getProjectStatusStats<T extends StatusCountProject>(
  projects: readonly T[],
): Array<{ status: ProjectStatus; count: number }> {
  const counts = new Map<ProjectStatus, number>();
  for (const project of projects) counts.set(project.data.status, (counts.get(project.data.status) ?? 0) + 1);
  const statuses: ProjectStatus[] = ['active', 'completed', 'archived'];
  return statuses.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}
