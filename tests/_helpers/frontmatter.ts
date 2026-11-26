import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { projectSchema, type ProjectData } from '../../src/lib/project-schema';
import { isPublishableProject } from '../../src/lib/publishing-rules';

/**
 * 从 Markdown 文件读取 YAML frontmatter。共享正则确保所有测试消费方对
 * frontmatter 边界的理解与 Astro loader 一致（/^---\r?\n([\s\S]*?)\r?\n---/）。
 */
export function readMarkdownFrontmatter(filePath: string): Record<string, unknown> {
  const markdown = readFileSync(filePath, 'utf8');
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!match?.[1]) {
    throw new Error(`${filePath} 缺少 YAML frontmatter`);
  }

  return parseYaml(match[1]) as Record<string, unknown>;
}

/**
 * 读 src/content/projects/<slug> 的 frontmatter，同时支持 .md 与 .mdx。
 * 四个测试文件原本各自内联了一份实现，这里合并成单点。
 */
export function readProjectFrontmatter(slug: string): Record<string, unknown> {
  const base = `src/content/projects/${slug}`;
  return readMarkdownFrontmatter(existsSync(`${base}.md`) ? `${base}.md` : `${base}.mdx`);
}

/** 项目内容目录下的全部 slug（.md 与 .mdx），按文件名排序。 */
export function readProjectSlugs(): string[] {
  return readdirSync('src/content/projects', { withFileTypes: true })
    .filter((entry) => entry.isFile() && ['.md', '.mdx'].includes(extname(entry.name)))
    .map((entry) => entry.name.replace(/\.mdx?$/, ''))
    .toSorted();
}

/**
 * 生产构建中真正会生成页面的项目：草稿与违反发布红线的项目都不进入产物。
 * 判定复用 src/lib/publishing-rules，与页面构建保持同一口径，
 * 避免测试按「非草稿即发布」断言而与构建结果不一致。
 */
export function readPublishedProjects(): Array<{ slug: string; data: ProjectData }> {
  return readProjectSlugs()
    .map((slug) => ({ slug, data: projectSchema.parse(readProjectFrontmatter(slug)) }))
    .filter(({ data }) => isPublishableProject(data));
}
