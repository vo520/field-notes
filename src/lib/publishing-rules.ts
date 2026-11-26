/**
 * 项目发布红线（跨字段约束）的单一事实源。
 *
 * 这些约束无法在 CMS 保存时预先拦截，也不适合放进 content schema 抛错
 * （一次后台误操作不该让整站构建失败）——统一由发布闸门判定：
 * 违规项目不进入构建产物，仅记录原因。
 *
 * 本模块刻意保持零依赖（不引入 zod / Astro runtime），
 * 让构建脚本（generate-og.mjs）与测试（build-smoke）在纯 Node 下也能复用同一判定。
 */
import { toTagSlug } from './slug.ts';

export type ProjectPublishingIssuePath = 'cover' | 'repoUrl' | 'repositories' | 'category';

export interface ProjectPublishingIssue {
  path: ProjectPublishingIssuePath;
  message: string;
}

/** 结构化鸭子类型：ProjectData 与解析前的 frontmatter 都能直接传入 */
export interface ProjectPublishingRuleInput {
  draft?: unknown;
  cover?: string | undefined;
  sourceVisibility?: string | undefined;
  repoUrl?: string | undefined;
  repositories?: readonly unknown[] | undefined;
  category?: string | undefined;
}

export interface ProjectPublishingOptions {
  /**
   * 站点当前的项目分类清单（projects.json → projectsPage.categories）。
   * 不传则跳过分类校验，供只关心内容字段的脚本使用。
   */
  categories?: readonly string[];
}

/**
 * 草稿标记归一：只认布尔 true 与大小写无关的 'true'（手写 YAML 常见 `True`）。
 * 其他写法（'False'、'yes'）不算草稿——schema 侧会对它们报错，这里保持同一口径，
 * 避免 OG 脚本与页面构建对同一份内容得出相反结论。
 */
export function isDraftFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

export function getProjectPublishingIssues(
  project: ProjectPublishingRuleInput,
  options: ProjectPublishingOptions = {},
): ProjectPublishingIssue[] {
  if (isDraftFlag(project.draft)) return [];

  const issues: ProjectPublishingIssue[] = [];

  // 分类清单迁移到 projects.json 后由后台维护：改掉分类名而项目还写着旧名字时，
  // 只跳过该项目并提示，不把整站构建拖垮。
  // 清单为空视为「未配置」，避免后台误清空后把所有项目一起藏起来。
  // 后台保存校验会先去掉分类首尾空格再比对清单，这里口径保持一致：
  // OG 脚本与构建冒烟测试直接拿原始 frontmatter，若不做 trim，
  // 就会出现「后台保存能通过、构建却按未知分类跳过项目」。
  // 全空白保留原值，仍按「不在清单里」处理。
  const categories = options.categories;
  const categoryName = project.category?.trim() || project.category;
  // 与筛选条、分类页、后台保存校验共用 toTagSlug 口径：
  // 大小写/全半角差异视为同一分类，避免后台保存通过却被构建期按旧口径跳过项目。
  if (
    categories?.length
    && categoryName
    && !categories.some((item) => toTagSlug(item.trim()) === toTagSlug(categoryName))
  ) {
    issues.push({ path: 'category', message: `分类「${categoryName}」不在站点的项目分类清单里` });
  }

  // Astro 侧拿的是 zod 解析后数据（缺省已补 'public'，空串已被 omitEmpty 清掉），
  // OG 脚本拿的是原始 frontmatter，这里统一按「空串等同未提供」归一，
  // 保证两条路径对同一份内容得出相同结论。
  const visibility = project.sourceVisibility || 'public';

  if (!project.cover) {
    issues.push({ path: 'cover', message: '项目必须提供仓库内封面' });
  }

  if (visibility === 'public' && !project.repoUrl) {
    issues.push({ path: 'repoUrl', message: '公开源码项目必须提供源码地址' });
  }

  if (visibility === 'private' && project.repoUrl) {
    issues.push({ path: 'repoUrl', message: '私有项目不能提供公开源码地址' });
  }

  if (visibility === 'private' && project.repositories?.length) {
    issues.push({ path: 'repositories', message: '私有项目不能公开关联仓库' });
  }

  return issues;
}

export function isPublishableProject(
  project: ProjectPublishingRuleInput,
  options: ProjectPublishingOptions = {},
): boolean {
  return !isDraftFlag(project.draft) && getProjectPublishingIssues(project, options).length === 0;
}
