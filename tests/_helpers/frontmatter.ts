import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

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
