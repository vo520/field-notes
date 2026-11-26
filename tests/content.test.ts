import { existsSync, readdirSync } from 'node:fs';
import { extname, parse } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  estimateReadingTime,
  getRelatedByTags,
  groupBySlug,
  isPublishedProject,
  isVisibleEntry,
  sortByPublishedAt,
  toTagSlug,
} from '../src/lib/content';
import { projectSchema, repositoryUrlPattern } from '../src/lib/project-schema';
import type { ProjectData } from '../src/lib/project-schema';
import { readMarkdownFrontmatter } from './_helpers/frontmatter';

function isProductionProject(frontmatter: unknown): boolean {
  const data = projectSchema.parse(frontmatter);
  return isPublishedProject({ id: 'test', data }, true);
}

// 五段式测试框架：
// 1. 用户要完成什么：阅读时长、发布可见性与项目 id 唯一性符合预期。
// 2. 页面要怎么走：发布时间排序决定列表顺序，标签 slug 决定路由。
// 3. 空和失败怎么处理：纯标点标签回落、旧分类被闸门拦下、私有项目不携带公开仓库。
// 4. 界面为什么这样排版：标签/分类/相关推荐共用同一 slug 聚合口径。
// 5. 最后代码怎么落地：schema 默认值正确、公开/私有源码声明与发布产物一致。

describe('content contract', () => {

  // 内容目录只扫描/校验一次，两个用例共用同一快照，避免重复读盘与重复解析
  let projectFiles: { name: string; id: string; project: ProjectData }[];

  beforeAll(() => {
    projectFiles = readdirSync('src/content/projects', { withFileTypes: true })
      .filter((entry) => entry.isFile() && ['.md', '.mdx'].includes(extname(entry.name)))
      .map((entry) => ({
        name: entry.name,
        id: parse(entry.name).name,
        project: projectSchema.parse(readMarkdownFrontmatter(`src/content/projects/${entry.name}`)),
      }));
  });

  const projectWithoutDraft = {
    title: '默认公开项目',
    description: '用于验证内容模型默认值。',
    publishedAt: '2026-07-14',
    status: 'active',
    category: '个人品牌',
    tech: ['Astro'],
    cover: '/images/projects/example.png',
    repoUrl: 'https://github.com/vo520/example',
    screenshots: Array.from({ length: 4 }, (_, index) => ({
      src: `/images/projects/example/screen-${index + 1}.png`,
      alt: `默认公开项目页面 ${index + 1}`,
      title: `页面 ${index + 1}`,
      caption: '用于验证内容模型默认值的合法截图元数据。',
      viewport: 'desktop',
      width: 1440,
      height: 900,
    })),
  };

  describe('1. 用户要完成什么：阅读时长、发布可见性与唯一 id', () => {
    it('counts mixed Chinese and English text with a minimum of one minute', () => {
      expect(estimateReadingTime('这是中文内容 Astro static site')).toBe(1);
    });

    it('counts longer Chinese content independently from Latin words', () => {
      expect(estimateReadingTime('中'.repeat(600))).toBe(2);
    });

    it('hides drafts only in production', () => {
      expect(isVisibleEntry({ data: { draft: true } }, true)).toBe(false);
      expect(isVisibleEntry({ data: { draft: true } }, false)).toBe(true);
      expect(isVisibleEntry({ data: { draft: false } }, true)).toBe(true);
    });

    it('publishes every production-visible project with a unique id', () => {
      const projectIds = projectFiles
        .filter(({ id, project }) => isPublishedProject({ id, data: project }, true))
        .map(({ id }) => id);

      // 清单随内容目录变化，这里只约束「有内容」且 id 不重复，避免每次增删项目都要改死名单
      expect(projectIds.length).toBeGreaterThan(0);
      expect(new Set(projectIds).size).toBe(projectIds.length);
    });

  });

  describe('2. 页面要怎么走：排序决定列表、slug 决定路由', () => {
    it('sorts newest content first without mutating the input', () => {
      const entries = [
        { data: { publishedAt: new Date('2025-01-01') } },
        { data: { publishedAt: new Date('2026-01-01') } },
      ];

      const sorted = sortByPublishedAt(entries);

      expect(sorted[0]!.data.publishedAt.getUTCFullYear()).toBe(2026);
      expect(entries[0]!.data.publishedAt.getUTCFullYear()).toBe(2025);
    });

    it('同一发布时间下按 id 兜底排序，保证输出顺序稳定', () => {
      const entries = [
        { id: 'zeta', data: { publishedAt: new Date('2026-07-10') } },
        { id: 'alpha', data: { publishedAt: new Date('2026-07-10') } },
      ];

      expect(sortByPublishedAt(entries).map((entry) => entry.id)).toEqual(['alpha', 'zeta']);
    });

    it('creates stable lower-case tag paths without discarding Chinese', () => {
      expect(toTagSlug('Git Worktree')).toBe('git-worktree');
      expect(toTagSlug('工程实践')).toBe('工程实践');
      expect(toTagSlug('API / 设计')).toBe('api-设计');
      expect(toTagSlug('C++ & Rust')).toBe('c-rust');
      expect(toTagSlug('100% 覆盖')).toBe('100-覆盖');
    });

  });

  describe('3. 空和失败怎么处理：空标签回落、旧分类与私有仓库闸门', () => {
    it('falls back to a stable slug for punctuation-only tags', () => {
      expect(toTagSlug('+++')).toBe('tag');
      expect(toTagSlug(' --- ')).toBe('tag');
      expect(toTagSlug('')).toBe('tag');
    });

    it('accepts a stale category at schema level but keeps it out of production', () => {
      // 分类清单已迁到 site.json：schema 只保证非空（不因改分类名让构建失败），
      // 但旧分类不在清单里时由发布闸门拦下，不进入生产产物。
      expect(projectSchema.safeParse({ ...projectWithoutDraft, category: '旧分类' }).success).toBe(true);
      expect(isProductionProject({
        ...projectWithoutDraft,
        category: '旧分类',
      })).toBe(false);
    });

    it('keeps private projects that still list public repositories out of production', () => {
      expect(isProductionProject({
        ...projectWithoutDraft,
        sourceVisibility: 'private',
        repoUrl: undefined,
        repositories: [{
          name: '前台仓库',
          role: 'frontend',
          description: '用于验证私有项目的仓库互斥约束。',
          tech: ['Astro'],
          url: 'https://github.com/vo520/example',
        }],
      })).toBe(false);
    });

  });

  describe('4. 界面为什么这样排版：标签/分类/推荐共用聚合口径', () => {
    it('groups tags by slug once per article, keeping the newest spelling as label', () => {
      const articles = [
        { id: 'newer', data: { tags: ['Astro', 'astro', 'API / 设计'] } },
        { id: 'older', data: { tags: ['Astro', '工程实践'] } },
      ];

      const groups = groupBySlug(articles, (article) => article.data.tags);

      // 同一篇文章里 Astro / astro 归一化后相同，只能算一次；label 取最新文章里的写法
      expect(groups.map((group) => [group.slug, group.label, group.entries.map((entry) => entry.id)])).toEqual([
        ['astro', 'Astro', ['newer', 'older']],
        ['api-设计', 'API / 设计', ['newer']],
        ['工程实践', '工程实践', ['older']],
      ]);
    });

    it('groups single-value categories through the same slug rule', () => {
      const projects = [
        { id: 'p1', data: { category: '个人品牌' } },
        { id: 'p2', data: { category: '个人品牌' } },
        { id: 'p3', data: { category: 'AI 工具' } },
      ];

      expect(groupBySlug(projects, (project) => [project.data.category]).map((group) => [group.slug, group.entries.length]))
        .toEqual([['个人品牌', 2], ['ai-工具', 1]]);
    });

    it('matches related entries through the same slug rule as tag pages', () => {
      const current = { id: 'current', data: { tags: ['API 设计'], tech: [] } };
      const sameTag = { id: 'same', data: { tags: ['API / 设计'], tech: [] } };
      const unrelated = { id: 'unrelated', data: { tags: ['Astro'], tech: [] } };

      expect(getRelatedByTags([current, sameTag, unrelated], current).map((entry) => entry.id)).toEqual(['same']);
    });

  });

  describe('5. 最后代码怎么落地：schema 默认值与源码声明一致', () => {
    it('treats an omitted draft flag as production-visible after schema defaults', () => {
      expect(isProductionProject(projectWithoutDraft)).toBe(true);
    });

    it('keeps public and private source declarations consistent', () => {
      for (const { name, id, project } of projectFiles) {
        // 草稿和违反发布红线的项目不会进入构建产物，只校验实际会发布的项目
        if (!isPublishedProject({ id, data: project }, true)) continue;

        if (project.sourceVisibility === 'public') {
          expect(project.repoUrl, name).toMatch(repositoryUrlPattern);
        } else {
          expect(project.repoUrl, name).toBeUndefined();
        }
        expect(existsSync(`public${project.cover}`), name).toBe(true);
      }
    });

  });

});
