import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, parse } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  estimateReadingTime,
  findArticleProject,
  getArticlePager,
  getArticleProjectIssue,
  getArticleProjectSlug,
  getArticlesForProject,
  getRelatedByTags,
  getSeriesAwareRelated,
  getSeriesNeighbors,
  buildArticleSections,
  groupArticlesIntoSeries,
  groupBySlug,
  sortArticlesForReading,
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
  let articleFiles: { name: string; id: string; frontmatter: Record<string, unknown> }[];

  beforeAll(() => {
    projectFiles = readdirSync('src/content/projects', { withFileTypes: true })
      .filter((entry) => entry.isFile() && ['.md', '.mdx'].includes(extname(entry.name)))
      .map((entry) => ({
        name: entry.name,
        id: parse(entry.name).name,
        project: projectSchema.parse(readMarkdownFrontmatter(`src/content/projects/${entry.name}`)),
      }));
    articleFiles = readdirSync('src/content/articles', { withFileTypes: true })
      .filter((entry) => entry.isFile() && ['.md', '.mdx'].includes(extname(entry.name)))
      .map((entry) => ({
        name: entry.name,
        id: parse(entry.name).name,
        frontmatter: readMarkdownFrontmatter(`src/content/articles/${entry.name}`),
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

    it('links an article to its declared project and lets the project find it back', () => {
      const articles = [
        { id: 'notes', data: { project: 'Robot-Forum-miniapp' } },
        { id: 'standalone', data: { project: undefined } },
      ];
      const projects = [{ id: 'robot-forum-miniapp' }];

      expect(findArticleProject(articles[0]!, projects)?.id).toBe('robot-forum-miniapp');
      expect(findArticleProject(articles[1]!, projects)).toBeUndefined();
      expect(getArticlesForProject(articles, 'robot-forum-miniapp').map((entry) => entry.id)).toEqual(['notes']);
    });

    it('keeps every real article pointing at a project that exists', () => {
      // 无效引用会让文章静默落回「独立文章」组，归属丢失却没有任何提示。
      // 后台已加 preSave 校验，这里再从内容侧兜一层，避免绕过后台写坏。
      const projectIds = new Set(projectFiles.map(({ id }) => toTagSlug(id)));

      for (const { id, frontmatter } of articleFiles) {
        const project = frontmatter.project;
        if (typeof project !== 'string' || project.trim() === '') continue;
        expect(projectIds.has(toTagSlug(project)), `文章 "${id}" 关联了不存在的项目 "${project}"`).toBe(true);
      }
    });

    it('walks a series one article at a time without wrapping at the edges', () => {
      const series = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];

      expect(getSeriesNeighbors(series, 'one')).toEqual({ next: series[1] });
      expect(getSeriesNeighbors(series, 'two')).toEqual({ previous: series[0], next: series[2] });
      expect(getSeriesNeighbors(series, 'three')).toEqual({ previous: series[1] });
      expect(getSeriesNeighbors(series, 'missing')).toEqual({});
    });

    it('never falls back to the global timeline at a series edge', () => {
      const series = [{ id: 'one' }, { id: 'two' }];
      // 全站按发布时间倒序：series 的两篇夹在独立文章之间
      const all = [{ id: 'newest' }, ...series, { id: 'older' }];

      expect(getArticlePager(all, series, 'one')).toEqual({ next: series[1] });
      expect(getArticlePager(all, series, 'two')).toEqual({ previous: series[0] });
      expect(getArticlePager(all, series, 'newest')).toEqual({});
    });

    it('uses the global timeline only for standalone articles', () => {
      const all = [{ id: 'new' }, { id: 'current' }, { id: 'old' }];

      expect(getArticlePager(all, undefined, 'current')).toEqual({
        previous: { id: 'old' },
        next: { id: 'new' },
      });
      expect(getArticlePager(all, [], 'new')).toEqual({ previous: { id: 'current' } });
      expect(getArticlePager(all, [], 'old')).toEqual({ next: { id: 'current' } });
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
      // 分类清单已迁到 projects.json：schema 只保证非空（不因改分类名让构建失败），
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

    it('reports a broken project reference without blocking the article itself', () => {
      const published = new Set(['robot-forum-miniapp']);

      expect(getArticleProjectIssue({ data: { project: undefined } }, published)).toBeUndefined();
      expect(getArticleProjectIssue({ data: { project: ' ROBOT / FORUM-MINIAPP ' } }, published)).toBeUndefined();
      expect(getArticleProjectIssue({ data: { project: 'missing-project' } }, published)).toContain('missing-project');
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

    it('normalizes article project slugs with the same rule as tag pages', () => {
      expect(getArticleProjectSlug({ data: { project: ' Robot Forum / Miniapp ' } })).toBe('robot-forum-miniapp');
      expect(getArticleProjectSlug({ data: { project: '   ' } })).toBeUndefined();
    });

    it('groups articles by project into series with chronological reading order', () => {
      const day = (value: string) => new Date(value);
      const articles = [
        { id: 'latest', data: { project: 'alpha', publishedAt: day('2026-03-01') } },
        { id: 'beta', data: { project: 'beta', publishedAt: day('2026-02-20') } },
        { id: 'first', data: { project: 'alpha', publishedAt: day('2026-01-01') } },
        { id: 'standalone', data: { project: undefined, publishedAt: day('2026-01-15') } },
      ];
      const projects = [
        { id: 'alpha', data: { title: 'Alpha 项目' } },
        { id: 'beta', data: { title: 'Beta 项目' } },
      ];

      const groups = groupArticlesIntoSeries(articles, projects, '独立文章');

      expect(groups.map((group) => [group.key, group.title, group.articles.map((entry) => entry.id)])).toEqual([
        ['alpha', 'Alpha 项目', ['first', 'latest']],
        ['beta', 'Beta 项目', ['beta']],
        ['standalone', '独立文章', ['standalone']],
      ]);
      expect(groups[0]!.project?.id).toBe('alpha');
      expect(groups[2]!.project).toBeUndefined();
    });

    it('orders series by each series own newest article, not by reading-order tail', () => {
      const day = (value: string) => new Date(value);
      // 章节顺序与发布时间相反：alpha 的最新一篇排在阅读顺序最前，末项反而是最旧的
      const chapters = [
        { slug: 'intro', title: '01 入门' },
        { slug: 'deep', title: '02 深入' },
      ];
      const articles = [
        { id: 'alpha-new', data: { project: 'alpha', chapter: 'intro', order: 1, publishedAt: day('2026-03-10') } },
        { id: 'alpha-old', data: { project: 'alpha', chapter: 'deep', order: 1, publishedAt: day('2026-01-01') } },
        { id: 'beta', data: { project: 'beta', publishedAt: day('2026-02-01') } },
      ];
      const projects = [
        { id: 'alpha', data: { title: 'Alpha 项目' } },
        { id: 'beta', data: { title: 'Beta 项目' } },
      ];

      const groups = groupArticlesIntoSeries(articles, projects, '独立文章', chapters);

      // Alpha 最新 03-10 应排在 Beta 的 02-01 之前；若误取阅读顺序末项（01-01）则会被排到后面
      expect(groups.map((group) => group.key)).toEqual(['alpha', 'beta']);
      expect(groups[0]!.articles.map((entry) => entry.id)).toEqual(['alpha-new', 'alpha-old']);
    });

    it('normalizes chapter slugs when matching reading order', () => {
      const day = () => new Date('2026-11-26');
      // 后台可直接编辑章节 slug，大小写与空格需与文章侧同口径归一
      const chapters = [
        { slug: 'Alpha Chapter', title: '01 Alpha' },
        { slug: 'Beta Chapter', title: '02 Beta' },
      ];
      const articles = [
        { id: 'beta', data: { chapter: 'beta chapter', order: 1, publishedAt: day() } },
        { id: 'alpha', data: { chapter: 'alpha chapter', order: 2, publishedAt: day() } },
      ];

      expect(sortArticlesForReading(articles, chapters).map((entry) => entry.id)).toEqual(['alpha', 'beta']);
    });

    it('routes articles with unpublished projects into the standalone group', () => {
      const articles = [{ id: 'orphan', data: { project: 'hidden', publishedAt: new Date('2026-03-01') } }];
      const groups = groupArticlesIntoSeries(articles, [], '独立文章');

      expect(groups).toEqual([{
        key: 'standalone',
        title: '独立文章',
        project: undefined,
        articles,
        sections: [{ key: 'all', title: '未分组章节', articles }],
      }]);
    });

    it('orders articles by chapter then by explicit order instead of filename', () => {
      const day = (value: string) => new Date(value);
      const chapters = [
        { slug: 'foundation', title: '01 底座' },
        { slug: 'components', title: '02 组件' },
      ];
      const articles = [
        { id: 'utils', data: { chapter: 'foundation', order: 2, publishedAt: day('2026-11-26') } },
        { id: 'cards', data: { chapter: 'components', order: 1, publishedAt: day('2026-11-26') } },
        { id: 'bootstrap', data: { chapter: 'foundation', order: 1, publishedAt: day('2026-11-26') } },
        { id: 'untagged', data: { publishedAt: day('2026-11-26') } },
      ];

      expect(sortArticlesForReading(articles, chapters).map((entry) => entry.id))
        .toEqual(['bootstrap', 'utils', 'cards', 'untagged']);

      const sections = buildArticleSections(articles, chapters, '未分组章节');
      expect(sections.map((section) => [section.key, section.articles.map((entry) => entry.id)]))
        .toEqual([
          ['foundation', ['bootstrap', 'utils']],
          ['components', ['cards']],
          ['uncategorized', ['untagged']],
        ]);
    });

    it('drives the series pager from the chapter-aware reading order', () => {
      const day = (value: string) => new Date(value);
      const chapters = [{ slug: 'foundation', title: '01 底座' }];
      const articles = [
        { id: 'utils', data: { chapter: 'foundation', order: 2, publishedAt: day('2026-11-26') } },
        { id: 'bootstrap', data: { chapter: 'foundation', order: 1, publishedAt: day('2026-11-26') } },
      ];
      const series = groupArticlesIntoSeries(
        articles,
        [{ id: 'demo', data: { title: '示例项目' } }],
        '独立文章',
        chapters,
      );

      expect(series[0]!.articles.map((entry) => entry.id)).toEqual(['bootstrap', 'utils']);
      expect(getArticlePager(articles, series[0]!.articles, 'bootstrap').next?.id).toBe('utils');
      expect(getArticlePager(articles, series[0]!.articles, 'utils').previous?.id).toBe('bootstrap');
    });

    it('keeps every real article in a declared chapter with a unique order', () => {
      const chapters = (JSON.parse(readFileSync('src/data/articles.json', 'utf8')) as {
        articlesPage: { chapters: { slug: string }[] };
      }).articlesPage.chapters;
      const known = new Set(chapters.map((chapter) => toTagSlug(chapter.slug)));

      for (const { name, frontmatter } of articleFiles) {
        expect(known.has(toTagSlug(String(frontmatter.chapter ?? ''))), `${name} 的章节未在后台清单中声明`).toBe(true);
        expect(typeof frontmatter.order, `${name} 缺少章节内序号`).toBe('number');
      }
      const seen = new Set<string>();
      for (const { frontmatter } of articleFiles) {
        const key = `${toTagSlug(String(frontmatter.chapter))}:${frontmatter.order}`;
        expect(seen.has(key), `章节内序号重复：${key}`).toBe(false);
        seen.add(key);
      }
    });

    it('recommends the closest series neighbours before older siblings', () => {
      const make = (id: string, tags: string[] = []) => ({ id, data: { tags, tech: [], category: '' } });
      const series = [make('p1'), make('p2'), make('p3'), make('p4'), make('p5')];
      const all = [make('outside', ['shared']), ...series];

      expect(getSeriesAwareRelated(all, series, series[4]!, 3).map((entry) => entry.id)).toEqual(['p4', 'p3', 'p2']);
      expect(getSeriesAwareRelated(all, series, series[0]!, 3).map((entry) => entry.id)).toEqual(['p2', 'p3', 'p4']);
    });

    it('falls back to tag recommendations for standalone articles', () => {
      const make = (id: string, tags: string[] = []) => ({ id, data: { tags, tech: [], category: '' } });
      const all = [make('tagged', ['shared']), make('unrelated')];

      expect(getSeriesAwareRelated(all, undefined, make('solo', ['shared']), 3).map((entry) => entry.id))
        .toEqual(['tagged']);
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

    it('points every article cover at the cover of its declared chapter', () => {
      for (const { name, frontmatter } of articleFiles) {
        expect(frontmatter.cover, name).toBe(`/images/chapters/${frontmatter.chapter}.svg`);
      }
    });

    it('keeps every declared article project valid against the published project set', () => {
      const publishedIds = new Set(
        projectFiles
          .filter(({ id, project }) => isPublishedProject({ id, data: project }, true))
          .map(({ id }) => id),
      );

      for (const { name, frontmatter } of articleFiles) {
        const project = frontmatter.project as string | undefined;
        expect(getArticleProjectIssue({ data: { project } }, publishedIds), name).toBeUndefined();
      }
    });

  });

});
