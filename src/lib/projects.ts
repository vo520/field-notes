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
