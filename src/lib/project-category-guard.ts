/**
 * 项目分类校验规则：构建期（发布闸门）与后台保存时（Sveltia CMS preSave 钩子）共用，
 * 保证「后台能改分类清单」且「填错时当场提示」。
 * 这里不引入任何依赖，可安全打进后台与前台脚本。
 */

/** 后台 list 控件允许空行、首尾空格与重复项，这里统一清洗；顺序保持不变 */
export function normalizeCategories(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const normalized: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const category = item.trim();
    if (category && !normalized.includes(category)) normalized.push(category);
  }
  return normalized;
}

/** 项目条目与它当前的分类，供保存分类清单时反向校验使用 */
export interface ProjectCategoryUsage {
  /** 项目条目 id（文件名去掉扩展名），用于提示编辑者 */
  id: string;
  category: string;
}

export interface CategoryRemovalConflict {
  category: string;
  /** 仍在用这个分类的项目 id */
  projects: string[];
}

/**
 * 保存分类清单前的反向校验：找出「本次被删除或改名、但仍有项目在用」的分类。
 * 只比较旧清单里有、新清单里没有的分类；顺序沿用旧清单，与筛选条一致。
 */
export function getRemovedCategoriesInUse(
  previous: readonly string[],
  next: readonly string[],
  projects: readonly ProjectCategoryUsage[],
): CategoryRemovalConflict[] {
  const normalizedNext = normalizeCategories(next);
  // 清空整份清单是既有约定：视为「未配置」，项目照常发布，不在保存时拦
  if (normalizedNext.length === 0) return [];

  const kept = new Set(normalizedNext);
  const conflicts: CategoryRemovalConflict[] = [];

  for (const category of normalizeCategories(previous)) {
    if (kept.has(category)) continue;
    const ids = projects
      .filter((project) => (project.category ?? '').trim() === category)
      .map((project) => project.id);
    if (ids.length > 0) conflicts.push({ category, projects: ids });
  }

  return conflicts;
}

/**
 * 返回需要展示给编辑者的错误文案；返回 null 表示通过。
 * - 未填分类：交给 CMS 的必填校验，这里不重复拦截
 * - 清单为空：视为「后台未配置」，与构建期闸门一致，不拦
 */
export function getCategoryErrorMessage(
  categories: readonly string[],
  category: unknown,
): string | null {
  if (typeof category !== 'string') return null;

  const value = category.trim();
  if (!value || categories.length === 0) return null;
  if (categories.includes(value)) return null;

  return `分类「${value}」不在项目分类清单里。请到「站点信息 → 项目页 → 项目分类清单」添加，或改成以下之一：${categories.join('、')}`;
}

/**
 * 文章关联项目的保存校验：填了不存在的项目 slug 时给出可定位的提示。
 * 与项目分类校验同源，避免出现「文章保存成功、归属项目静默丢失」的情况。
 * - 未填：独立笔记，合法
 * - 匹配到项目：通过
 * - 项目清单拉不到：不拦（网络问题不该阻断正常保存），构建期闸门会兜底
 */
export function getArticleProjectErrorMessage(
  projectSlugs: readonly string[] | null,
  project: unknown,
): string | null {
  if (typeof project !== 'string') return null;

  const value = project.trim();
  if (!value) return null;
  if (!projectSlugs) return null;

  // 与前台一致的口径：项目 slug 归一化后比对，忽略大小写与多余空格
  const normalize = (value: string) =>
    value
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[\\/?#%&+]+/g, ' ')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  const slug = normalize(value);
  if (!slug) return null;
  if (projectSlugs.some((item) => normalize(item) === slug)) return null;

  return `关联项目「${value}」不存在。请填项目的英文短名（slug），例如 robot-forum-miniapp；留空表示独立笔记。`;
}
