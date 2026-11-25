/**
 * 项目发布红线（跨字段约束）的单一事实源。
 *
 * 这些约束无法在 CMS 保存时预先拦截，也不适合放进 content schema 抛错
 * （一次后台误操作不该让整站构建失败）——统一由发布闸门判定：
 * 违规项目不进入构建产物，仅记录原因。
 *
 * 本模块刻意保持零依赖（不引入 zod / Astro runtime），
 * 让构建脚本（generate-og.mjs）在纯 Node 下也能复用同一判定。
 */

export type ProjectPublishingIssuePath = 'cover' | 'repoUrl' | 'repositories';

export interface ProjectPublishingIssue {
  path: ProjectPublishingIssuePath;
  message: string;
}

/** 结构化鸭子类型：ProjectData 与解析前的 frontmatter 都能直接传入 */
export interface ProjectPublishingRuleInput {
  draft?: boolean | undefined;
  cover?: string | undefined;
  sourceVisibility?: string | undefined;
  repoUrl?: string | undefined;
  repositories?: readonly unknown[] | undefined;
}

export function getProjectPublishingIssues(project: ProjectPublishingRuleInput): ProjectPublishingIssue[] {
  if (project.draft) return [];

  const issues: ProjectPublishingIssue[] = [];

  if (!project.cover) {
    issues.push({ path: 'cover', message: '公开项目必须提供仓库内封面' });
  }

  if (project.sourceVisibility === 'public' && !project.repoUrl) {
    issues.push({ path: 'repoUrl', message: '公开源码项目必须提供源码地址' });
  }

  if (project.sourceVisibility === 'private' && project.repoUrl) {
    issues.push({ path: 'repoUrl', message: '私有项目不能提供公开源码地址' });
  }

  if (project.sourceVisibility === 'private' && project.repositories?.length) {
    issues.push({ path: 'repositories', message: '私有项目不能公开关联仓库' });
  }

  return issues;
}

export function isPublishableProject(project: ProjectPublishingRuleInput): boolean {
  return !project.draft && getProjectPublishingIssues(project).length === 0;
}
