import { toTagSlug } from './content';

export const projectCategories = ['个人品牌', '电商平台', '社区服务', '企业官网', '门店经营', '供应链管理', '教育培训', '物流运输', '医疗健康', '人力资源', '财务管理', '销售管理', '合同管理', '物业服务', '客户服务', '文体活动', '零售餐饮', '生活服务', '工业能源', '售后服务', '采购供应链', '旅游住宿', '内容创作', '法律服务', '场馆运营'] as const;

export type ProjectCategory = typeof projectCategories[number];
export type ProjectCategoryFilter = '全部' | ProjectCategory;

function buildCategoryCounts<T extends { data: { category: ProjectCategory } }>(
  projects: readonly T[],
): ReadonlyMap<ProjectCategory, number> {
  const counts = new Map<ProjectCategory, number>();
  for (const project of projects) {
    counts.set(project.data.category, (counts.get(project.data.category) ?? 0) + 1);
  }
  return counts;
}

export function getProjectCategories<T extends { data: { category: ProjectCategory } }>(
  projects: readonly T[],
): ProjectCategoryFilter[] {
  const counts = buildCategoryCounts(projects);
  return ['全部', ...projectCategories.filter((category) => (counts.get(category) ?? 0) > 0)];
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
  return projectCategories.includes(value as ProjectCategory)
    ? value as ProjectCategory
    : '全部';
}

export function getProjectCategoryHref(category: ProjectCategory): string {
  return `/projects/categories/${toTagSlug(category)}/`;
}

export function getProjectCategoryUrl(
  currentUrl: string,
  filter: ProjectCategoryFilter,
): string {
  const url = new URL(currentUrl);

  if (filter === '全部') {
    url.searchParams.delete('category');
  } else {
    url.searchParams.set('category', filter);
  }

  return url.toString();
}

export function matchesProjectCategory(
  category: ProjectCategory,
  filter: ProjectCategoryFilter,
): boolean {
  return filter === '全部' || category === filter;
}
