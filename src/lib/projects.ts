import siteData from '../data/site.json';

/**
 * 项目分类清单的唯一数据源是 src/data/site.json 的 projectsPage.categories，
 * 后台可在「站点信息 → 项目页 → 项目分类清单」增删改，顺序即筛选条顺序。
 * 这里只读原始 JSON、不经过 zod，避免把整站配置解析带进浏览器端脚本。
 */
export const projectCategories: readonly string[] = siteData.projectsPage.categories;
export const ALL_PROJECT_CATEGORIES = '全部';

export type ProjectCategory = string;
export type ProjectCategoryFilter = typeof ALL_PROJECT_CATEGORIES | ProjectCategory;

function buildCategoryCounts<T extends { data: { category: ProjectCategory } }>(
  projects: readonly T[],
): ReadonlyMap<ProjectCategory, number> {
  const counts = new Map<ProjectCategory, number>();
  for (const project of projects) {
    counts.set(project.data.category, (counts.get(project.data.category) ?? 0) + 1);
  }
  return counts;
}

export function getProjectCategoryStats<T extends { data: { category: ProjectCategory } }>(
  projects: readonly T[],
): Array<{ category: ProjectCategory; count: number }> {
  const counts = buildCategoryCounts(projects);
  return projectCategories.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
  }));
}

export function parseProjectCategory(value: string | null): ProjectCategoryFilter {
  return value !== null && projectCategories.includes(value)
    ? value
    : ALL_PROJECT_CATEGORIES;
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
