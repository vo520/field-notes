import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { toTagSlug } from '../src/lib/content';
import { isDraftFlag } from '../src/lib/publishing-rules';
import { projectCategories } from '../src/lib/projects';
import {
  readMarkdownFrontmatter,
  readPublishedProjects,
} from './_helpers/frontmatter';

// 项目清单从内容目录派生（跳过草稿与违反发布红线的项目），避免 CMS 增删项目后测试里的硬编码快照失效
const publishedProjects = readPublishedProjects();
const publishedProjectSlugs = publishedProjects.map(({ slug }) => slug).toSorted();
const publicProjects = publishedProjects.map(({ slug, data }) => ({
  slug,
  title: data.title,
  cover: data.cover ?? '',
  repoUrl: data.repoUrl,
  featured: data.featured,
  category: data.category,
  publishedAt: data.publishedAt.toISOString().slice(0, 10),
}));

// 复刻 src/pages/index.astro 的选择逻辑：先按发布时间倒序，再稳定排序让 featured 前置，取前 3
const homeProjectSlugs = [...publicProjects]
  .sort(
    (left, right) =>
      right.publishedAt.localeCompare(left.publishedAt) || left.slug.localeCompare(right.slug),
  )
  .sort((left, right) => Number(right.featured) - Number(left.featured))
  .slice(0, 3)
  .map(({ slug }) => slug);

const obsoleteProjectSlugs = [
  'toolkit-box',
  'api-bench',
  'db-snapshot-diff',
  'web-scraper',
  'bi-report',
  'inventory-system',
  'invoice-ocr',
  'excel-analyzer',
] as const;

/** Astro 会把组件 <script> 打包成外链模块；交互护栏断言需要把产物脚本一起读进来。 */
function readBundledScripts(): string {
  return readdirSync('dist/_astro')
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join('dist/_astro', name), 'utf8'))
    .join('\n');
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const jpegSignature = [0xff, 0xd8, 0xff];

// 与 astro.config.mjs 的 site 默认值一致；用 SITE_URL 覆盖构建域名时断言也不会误报
const siteOrigin = (process.env.SITE_URL ?? 'https://blog.ytn520.top').replace(/\/$/, '');

function listHtmlFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      return listHtmlFiles(entryPath);
    }

    return entry.isFile() && extname(entry.name) === '.html' ? [entryPath] : [];
  });
}

/**
 * 生产构建中可见的条目：与 schema 的 looseBoolean + isVisibleEntry(entry, true) 一致。
 * 这里读的是原始 frontmatter，必须用 isDraftFlag 归一 `draft: True` / `'true'` 等写法，
 * 否则构建会跳过草稿、测试却断言页面存在。
 */
function visibleMarkdownSlugs(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => /\.mdx?$/.test(name))
    .filter((name) => !isDraftFlag(readMarkdownFrontmatter(join(dir, name)).draft))
    .map((name) => name.replace(/\.mdx?$/, ''))
    .toSorted();
}

function projectSlugsIn(html: string): Set<string> {
  return new Set(
    [...html.matchAll(/\/projects\/([a-z0-9-]+)\//g)]
      .map((match) => match[1]!)
      .filter((slug) => slug !== 'categories'),
  );
}

function expectValidImage(path: string, label: string) {
  const bytes = readFileSync(path);
  const text = bytes.toString('utf8');

  const isPng = [...bytes.subarray(0, 8)].every((value, index) => value === pngSignature[index]);
  const isJpeg = jpegSignature.every((value, index) => bytes[index] === value);
  const isWebp = bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
  const isSvg = label.endsWith('.svg') && text.includes('<svg');

  expect(isPng || isJpeg || isWebp || isSvg, `${label} must be a PNG, JPEG, WebP, or SVG`).toBe(true);
  if (isPng) {
    expect(bytes.readUInt32BE(16), `${label} width`).toBeGreaterThan(0);
    expect(bytes.readUInt32BE(20), `${label} height`).toBeGreaterThan(0);
  }
}

function countOpeningTagsWithAttribute(html: string, tag: string, attribute: string): number {
  const attributeValue = `(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`;
  const openingTag = new RegExp(
    `<${tag}\\b(?=[^>]*\\s${attribute}${attributeValue}(?=\\s|/?>))[^>]*>`,
    'g',
  );

  return html.match(openingTag)?.length ?? 0;
}

// 五段式测试框架（构建产物冒烟）：
// 1. 用户要完成什么：首页/404/内容页/爬虫身份产物齐全可用。
// 2. 页面要怎么走：首页目录 → 项目详情 → 分类筛选 → 关于叙事的浏览路径成立。
// 3. 空和失败怎么处理：404/CMS/审核页 noindex、SRI 校验、匿名评论接口不再存在。
// 4. 界面为什么这样排版：每页 OG 图指向真实资源，搜索/订阅/站点地图结构完整。
// 5. 最后代码怎么落地：Giscus 宿主接入文章/项目/留言三类页面。

describe('static site build', () => {

  describe('1. 用户要完成什么：核心页面与身份产物齐全', () => {
    it('builds the home and 404 pages with the light/dark toggle and the free promise', () => {
      expect(existsSync('dist/index.html')).toBe(true);
      expect(existsSync('dist/404.html')).toBe(true);
      expect(readFileSync('dist/404.html', 'utf8')).toContain('name="robots" content="noindex"');

      const home = readFileSync('dist/index.html', 'utf8');
      expect(home).toContain('data-theme-toggle');
      expect(home.match(/<button\b[^>]*data-theme-toggle[^>]*>/g)).toHaveLength(1);
      expect(home).toContain("localStorage.getItem('site-theme')");
      for (const legacyTheme of ['observatory', 'nebula', 'terminal']) {
        expect(home).not.toContain(legacyTheme);
      }
      expect(home).toContain('项目工作台 · 技术文章 · 站内讨论');
      expect(home).toContain('data-pagefind-body');
      for (const slug of homeProjectSlugs) {
        expect(home).toContain(`/projects/${slug}/`);
      }
      expect(home).toContain(siteOrigin);
    });

    it('builds one HTML page per content entry and the fixed static entries', () => {
      for (const page of ['index.html', '404.html']) {
        expect(existsSync(`dist/${page}`), page).toBe(true);
      }
      for (const page of ['about', 'archive', 'articles', 'guestbook', 'projects', 'projects/categories', 'search', 'tags', 'admin']) {
        expect(existsSync(`dist/${page}/index.html`), page).toBe(true);
      }
      expect(existsSync('dist/admin/review/index.html')).toBe(true);

      // 项目走发布闸门口径（草稿与违反红线的项目不生成页面），文章只受 draft 约束
      const visibleEntries: Array<[string, string[]]> = [
        ['articles', visibleMarkdownSlugs('src/content/articles')],
        ['projects', publishedProjectSlugs],
      ];

      for (const [collection, slugs] of visibleEntries) {
        expect(slugs.length, `${collection} entries`).toBeGreaterThan(0);
        for (const slug of slugs) {
          expect(existsSync(`dist/${collection}/${slug}/index.html`), `${collection}/${slug}`).toBe(true);
        }
      }
    });

    it('builds article details and tag indexes with a page-level h1', () => {
      expect(existsSync('dist/tags/index.html')).toBe(true);

      const articleSlugs = visibleMarkdownSlugs('src/content/articles');

      for (const slug of articleSlugs) {
        const article = readFileSync(`dist/articles/${slug}/index.html`, 'utf8');
        expect(article, slug).toContain('文章目录');
        expect(article, slug).toContain('"@type":"BlogPosting"');
        expect(article, slug).toContain(`/og/articles/${slug}.png`);
        expect(existsSync(`dist/og/articles/${slug}.png`), slug).toBe(true);
      }

      const tagSlugs = readdirSync('dist/tags', { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .toSorted();
      expect(tagSlugs.length).toBeGreaterThan(0);

      const articlesIndex = readFileSync('dist/articles/index.html', 'utf8');
      const tagsIndex = readFileSync('dist/tags/index.html', 'utf8');
      const tagIndex = readFileSync(`dist/tags/${tagSlugs[0]}/index.html`, 'utf8');
      expect(articlesIndex).toMatch(/<h1[^>]*>文章与实践记录<\/h1>/);
      expect(tagsIndex).toMatch(/<h1[^>]*>按标签浏览<\/h1>/);
      expect(tagsIndex).toContain(`href="/tags/${tagSlugs[0]}/"`);
      expect(tagIndex).toMatch(/<h1[^>]*># /);
      expect(tagIndex).toContain('href="/tags/"');
      expect(articlesIndex).toContain('/og/root.png');
      expect(tagIndex).toContain('/og/root.png');
      expect(readFileSync('dist/index.html', 'utf8')).toContain('href="/tags/"');
    });

    it('groups same-project articles into series on the writing index', () => {
      const articlesIndex = readFileSync('dist/articles/index.html', 'utf8');
      const siteData = JSON.parse(readFileSync('src/data/articles.json', 'utf8')) as {
        articlesPage: { seriesTitleTemplate: string; seriesEyebrow: string };
      };
      const projectTitles = siteData.articlesPage.seriesTitleTemplate;

      expect(articlesIndex).toContain(siteData.articlesPage.seriesEyebrow);
      expect(projectTitles).toContain('{title}');
      // 至少有一个系列分组标题，并且组内第一篇带系列序号
      expect(articlesIndex).toMatch(/系列<\/h2>/);
      expect(articlesIndex).toContain('第 01 篇');
    });

    it('keeps the series pager inside the group at both edges', () => {
      const pages = readdirSync('dist/articles', { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          id: entry.name,
          html: readFileSync(`dist/articles/${entry.name}/index.html`, 'utf8'),
        }));
      const first = pages.find(({ html }) => /第 1\/\d+ 篇/.test(html));
      const last = pages.find(({ html }) => /第 (\d+)\/\1 篇/.test(html));

      expect(first, '应存在带系列标识的首篇').toBeDefined();
      expect(last, '应存在带系列标识的末篇').toBeDefined();
      // 系列首篇没有「较早」入口，末篇没有「较新」入口，避免回退到全站后跨系列跳转
      expect(first!.html).not.toContain('较早文章');
      expect(last!.html).not.toContain('较新文章');
    });

    it('keeps standalone article pagination within the standalone group', () => {
      // 独立笔记按发布日期聚在项目文章之前（更早），若回退到全站时间序，
      // 「较新文章」会跳到不相关的项目系列。翻页序列必须留在独立组自己的阅读顺序里。
      const articleDir = 'src/content/articles';
      const standaloneSlugs = readdirSync(articleDir)
        .filter((name) => /\.mdx?$/.test(name))
        .filter((name) => !readMarkdownFrontmatter(join(articleDir, name)).project)
        .filter((name) => !isDraftFlag(readMarkdownFrontmatter(join(articleDir, name)).draft))
        .map((name) => name.replace(/\.mdx?$/, ''));
      expect(standaloneSlugs.length).toBeGreaterThan(1);

      const standaloneSet = new Set(standaloneSlugs);
      for (const slug of standaloneSlugs) {
        const html = readFileSync(`dist/articles/${slug}/index.html`, 'utf8');
        const nav = html.match(/<nav class="article-nav"[\s\S]*?<\/nav>/)?.[0] ?? '';
        const targets = [...nav.matchAll(/href="\/articles\/([^/]+)\/"/g)].map((match) => match[1]!);
        expect(targets.length, `${slug} 应有独立组内的翻页链接`).toBeGreaterThan(0);
        for (const target of targets) {
          expect(standaloneSet.has(target), `${slug} 翻页不应跳到项目文章 ${target}`).toBe(true);
        }
      }
    });

    it('publishes crawler and browser identity assets', () => {
      expect(existsSync('dist/robots.txt')).toBe(true);
      expect(existsSync('dist/favicon.svg')).toBe(true);

      const robots = readFileSync('dist/robots.txt', 'utf8');
      expect(robots).toContain(`${siteOrigin}/sitemap-index.xml`);
      expect(robots).toContain('Disallow: /admin/');
    });

  });

  describe('2. 页面要怎么走：首页目录、项目详情与分类筛选', () => {
    it('keeps every backend-editable navigation link pointing at a real page', () => {
      // 顶部导航与页脚链接是后台唯一「可改且不指向任何内容文件」的字段：
      // 后台只能校验 / 前缀，写错路径时线上直接是死链，却没有任何构建期信号。
      // 这里以产物为准核对目标是否存在，后台改错会当场失败而不是悄悄上线。
      const siteData = JSON.parse(readFileSync('src/data/site.json', 'utf8')) as {
        nav: { href: string; label: string }[];
        footer: { links: { href: string; label: string }[] };
      };
      const links = [...siteData.nav, ...siteData.footer.links];
      expect(links.length).toBeGreaterThan(0);

      for (const { href, label } of links) {
        expect(href.startsWith('/'), `${label} 的链接应为站内路径：${href}`).toBe(true);
        // 锚点只影响页内定位，不改变目标页面
        const path = href.split('#')[0] ?? href;
        const target = path.endsWith('/') ? join('dist', path, 'index.html') : join('dist', path);
        expect(existsSync(target), `${label} 指向不存在的页面：${href}`).toBe(true);
      }
    });

    it('keeps one filter button per category slug', () => {
      // 筛选条来自后台清单、按精确名去重；分类页按 toTagSlug 聚合。
      // 清单里同时填 Web 与 web 时会渲染两个视觉重复的按钮，却只生成一个分类页。
      const projectsPage = readFileSync('dist/projects/index.html', 'utf8');
      // 只取分类按钮：状态/技术筛选也用 data-project-filter，但不属于分类清单
      const filters = [...projectsPage.matchAll(/data-project-filter="([^"]+)"\s+data-project-filter-kind="category"/g)]
        .map((match) => match[1]!)
        .filter((value) => value !== '全部');
      expect(filters.length).toBeGreaterThan(0);

      const slugs = filters.map(toTagSlug);
      expect(new Set(slugs).size, `筛选条存在归一后重复的分类：${filters.join('、')}`).toBe(slugs.length);
    });

    it('never ships a file:// or local-path link to readers', () => {
      // 文章内容同样由后台可编辑，Markdown 里写 [x](file:///Users/...) 会被原样渲染成
      // href="file:///..."，线上点了指向读者自己机器的同名路径——既是死链又泄漏作者本地目录。
      // 正文只允许 http(s)、mailto 与站内路径，其余 scheme 在构建期拦下。
      const htmlFiles: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) walk(path);
          else if (entry.name.endsWith('.html')) htmlFiles.push(path);
        }
      };
      walk('dist');

      const offenders: string[] = [];
      for (const path of htmlFiles) {
        const html = readFileSync(path, 'utf8');
        // href 属性里出现 file: / 本机绝对路径，或指向作者 home 目录
        const bad = html.match(/href="(?:file:|\/Users\/)[^"]*"/g);
        if (bad) offenders.push(`${path}: ${bad.slice(0, 3).join(', ')}`);
      }
      expect(offenders, `发现不可达的本地链接：\n${offenders.join('\n')}`).toEqual([]);
    });

    it('builds every public project detail with its real cover and repository', () => {
      expect(existsSync('dist/projects/index.html')).toBe(true);

      const projects = readFileSync('dist/projects/index.html', 'utf8');
      expect(projects).toContain('data-project-filter');
      // 列表页没有按内容生成的 OG 图，必须回退站点默认图而不是指向 404
      expect(projects).toContain('/og/root.png');

      const detailSlugs = readdirSync('dist/projects', { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join('dist/projects', entry.name, 'index.html')))
        .map((entry) => entry.name)
        .filter((name) => name !== 'categories')
        .toSorted();
      expect(detailSlugs).toEqual(publicProjects.map(({ slug }) => slug).toSorted());

      for (const project of publicProjects) {
        const { slug, title, cover } = project;
        const detailPath = `dist/projects/${slug}/index.html`;
        // 封面是站内绝对路径（/images/...），上传目录不是固定的 projects/，按路径本身定位
        const coverPath = join('dist', cover.replace(/^\//, ''));

        expect(existsSync(detailPath), detailPath).toBe(true);
        expect(existsSync(coverPath), cover).toBe(true);
        expectValidImage(coverPath, cover);
        const detail = readFileSync(detailPath, 'utf8');
        expect(projects).toContain(title);
        expect(projects).toContain(cover);
        expect(detail).toContain('project-showcase');
        expect(detail).toContain(cover);
        expect(detail).toContain('property="og:image"');
        expect(detail).toContain(`/og/projects/${slug}.png`);
        expect(existsSync(`dist/og/projects/${slug}.png`), `og/projects/${slug}.png`).toBe(true);
        expect(detail).toContain('"@type":"SoftwareSourceCode"');

        const screenshots = publishedProjects.find((entry) => entry.slug === slug)?.data.screenshots ?? [];
        expect(countOpeningTagsWithAttribute(detail, 'section', 'data-project-screenshots')).toBe(
          screenshots.length > 0 ? 1 : 0,
        );
        expect(countOpeningTagsWithAttribute(detail, 'dialog', 'data-screenshot-dialog')).toBe(
          screenshots.length > 0 ? 1 : 0,
        );
        expect(countOpeningTagsWithAttribute(detail, 'button', 'data-screenshot-thumbnail')).toBe(
          screenshots.length,
        );
        for (const screenshot of screenshots) {
          const screenshotPath = join('dist', screenshot.src.replace(/^\//, ''));

          expect(existsSync(screenshotPath), screenshot.src).toBe(true);
          expectValidImage(screenshotPath, screenshot.src);
          expect(detail).toContain(screenshot.src);
        }

        if (project.repoUrl) {
          expect(detail).toContain(project.repoUrl);
        } else {
          expect(detail).toContain('私有仓库 · 未公开');
        }
      }

      obsoleteProjectSlugs.forEach((slug) => {
        expect(existsSync(`dist/projects/${slug}/index.html`), slug).toBe(false);
      });

      // OG 图与页面必须同生共死：分类改名/删除会让项目被发布闸门下线，
      // 但 OG 脚本若漏传分类清单，图仍会生成并公开泄漏标题与摘要。
      const ogProjects = readdirSync('dist/og/projects').filter((file) => file.endsWith('.png'));
      for (const file of ogProjects) {
        const slug = file.replace(/\.png$/, '');
        expect(existsSync(`dist/projects/${slug}/index.html`), `OG 图无对应发布页：${slug}`).toBe(true);
      }
    });

    it('publishes the product engineer story with projects before articles', () => {
      const home = readFileSync('dist/index.html', 'utf8');
      const about = readFileSync('dist/about/index.html', 'utf8');

      expect(home).toContain('把复杂业务，做成可运行的产品。');
      expect(home.indexOf('项目作品')).toBeLessThan(home.indexOf('最近写下的内容'));
      expect(about).toContain('我不只写代码，也负责让产品落地。');
      expect(about).toContain('PHP / Vue');
      expect(about).toContain('ABOUT NICE');
      expect(home).not.toContain('Field Notes');
    });

    it('shows real reading time on home article cards instead of a generic fallback', () => {
      const home = readFileSync('dist/index.html', 'utf8');
      const articleSection = home.slice(home.indexOf('home-section--last'));
      const minutes = [...articleSection.matchAll(/class="card-meta"[^>]*>\s*(\d+)\s*分钟阅读/g)];

      // 首页 4 张文章卡片都应显示由正文估算出的阅读时长，而非统一的「阅读详情」占位
      expect(minutes.length).toBe(4);
      for (const match of minutes) expect(Number(match[1])).toBeGreaterThan(0);
      expect(articleSection).not.toContain('阅读详情');
    });

    it('puts only the three selected project cards in the home product catalog', () => {
      const home = readFileSync('dist/index.html', 'utf8');

      const heroStart = home.indexOf('class="hero-studio"');
      const asideStart = home.indexOf('class="open-source-promise"');
      const catalogStart = home.indexOf('data-home-project-catalog');

      expect(heroStart).toBeGreaterThan(-1);
      expect(asideStart).toBeGreaterThan(heroStart);
      expect(catalogStart).toBeGreaterThan(asideStart);
      expect(home.slice(catalogStart)).not.toContain('data-project-category-grid');

      // 目录区块到文章区块为止：页脚的随机漫游清单也含项目路径，不能算进精选卡片
      const catalogEnd = home.indexOf('home-section--last');
      expect(catalogEnd).toBeGreaterThan(catalogStart);
      const catalogHtml = home.slice(catalogStart, catalogEnd);

      const homeSlugs = projectSlugsIn(catalogHtml);
      expect(homeProjectSlugs).toHaveLength(3);
      expect([...homeSlugs].toSorted()).toEqual(homeProjectSlugs.toSorted());

      for (const slug of homeSlugs) {
        const project = publicProjects.find((entry) => entry.slug === slug);
        expect(project, slug).toBeDefined();
        expect(catalogHtml).toContain(project!.cover);
      }
    });

    it('builds product category filters only for categories that have projects', () => {
      const home = readFileSync('dist/index.html', 'utf8');
      const projects = readFileSync('dist/projects/index.html', 'utf8');

      expect(home).toContain(`data-project-count="${publicProjects.length}"`);
      expect(projects).toContain('data-project-catalog');
      expect(projects).toContain('来自 Gitee 与 GitHub 的项目');
      expect(projects).toContain('<h1');

      // 分类清单以 projects.json 为唯一来源（后台可增删改），测试不再复制一份硬编码顺序
      const categories = [...projectCategories];

      // 分类计数按实际发布的项目统计，与页面上的筛选项计数保持同一口径
      const counts = new Map<string, number>();
      for (const { data } of publishedProjects) {
        counts.set(data.category, (counts.get(data.category) ?? 0) + 1);
      }

      const present = categories.filter((category) => (counts.get(category) ?? 0) > 0);
      const absent = categories.filter((category) => (counts.get(category) ?? 0) === 0);

      expect(present.length).toBeLessThan(categories.length);
      // 筛选条现在有分类/状态/技术三类按钮，这里只数分类按钮
      expect(projects.match(/data-project-filter-kind="category"/g)).toHaveLength(present.length + 1);

      ['全部', ...present].forEach((category) => {
        const buttonStart = projects.indexOf(`data-project-filter="${category}"`);
        const filterButton = projects.slice(buttonStart, projects.indexOf('</button>', buttonStart));
        const expected = category === '全部' ? publicProjects.length : (counts.get(category) ?? 0);

        expect(buttonStart).toBeGreaterThan(-1);
        expect(filterButton).toContain(`data-project-filter-count="${expected}"`);
      });

      absent.forEach((category) => {
        expect(projects).not.toContain(`data-project-filter="${category}"`);
      });
    });

    it('ships scroll-driven interactions with motion and scroll-container guards', () => {
      const home = readFileSync('dist/index.html', 'utf8');
      const scripts = readBundledScripts();
      // 取任意一篇含目录的文章（并非每篇都有 h2/h3）
      const articleSlug = visibleMarkdownSlugs('src/content/articles')
        .find((slug) => readFileSync(`dist/articles/${slug}/index.html`, 'utf8').includes('data-toc-link'));
      expect(articleSlug, '应至少有一篇文章带目录').toBeDefined();
      const article = readFileSync(`dist/articles/${articleSlug}/index.html`, 'utf8');
      const screenshotSlug = publishedProjectSlugs.find((slug) =>
        readFileSync(`dist/projects/${slug}/index.html`, 'utf8').includes('data-screenshot-scroll-stage'));
      expect(screenshotSlug, '应至少有一个项目带截图舞台').toBeDefined();
      const screenshotProject = readFileSync(`dist/projects/${screenshotSlug}/index.html`, 'utf8');

      // 惯性滚轮必须带四道护栏，否则破坏移动端、减动效、内部滚动容器与锚点跳转
      for (const guard of [
        'pointer: fine',
        'prefers-reduced-motion: reduce',
        'overflowY',
        'dialog[open]',
      ]) {
        expect(scripts, `缺少滚轮护栏：${guard}`).toContain(guard);
      }
      // 逐帧写入必须覆盖 CSS 的 scroll-behavior: smooth，否则自身滚动会被误判并中断惯性
      expect(scripts).toMatch(/behavior:\s*[`'"]instant[`'"]/);
      expect(scripts).toContain('data-scroll-gallery][data-active="1"]');
      expect(scripts).toContain('data-screenshot-scroll-stage][data-active="1"]');
      // 统一粘性进度内核：行程裁剪 + rAF 节流 + 页面底部高亮兜底
      expect(scripts).toContain('offsetHeight-window.innerHeight');
      expect(scripts).toContain('getBoundingClientRect');
      // 画廊默认 SSR 为普通列表，data-active 仅由桌面脚本写入；面板与进度点齐全
      expect(home).toContain('data-scroll-gallery');
      expect(home).toContain('data-gallery-dots');
      expect(home).toContain('data-gallery-track');
      expect(home).toContain('data-gallery-fill');
      expect(home.match(/data-gallery-panel/g)?.length).toBeGreaterThan(1);
      expect(scripts).toContain('--panel-local');
      expect(scripts).toContain('--gallery-progress');
      // 视口淡入默认不隐藏内容：pending 标记由脚本运行时添加，而非写死在 SSR
      expect(scripts).toContain('is-reveal-pending');
      expect(scripts).toContain('is-reveal-in');
      // 首页/详情页悬浮章节导航与项目截图帧序列共用数据锚点
      expect(home).toContain('data-toc-variant="rail"');
      expect(screenshotProject).toContain('data-toc-variant="rail"');
      // 悬浮轨默认只显示节点，标签供悬停/聚焦展开；title 保证折叠态也有完整名称
      expect(home).toMatch(/data-toc-link="[^"]+"\s+title="/);
      // 返回顶部覆盖所有 HTML：BaseLayout 前台页面 + 独立 CMS 壳层
      for (const file of listHtmlFiles('dist')) {
        expect(readFileSync(file, 'utf8'), `${file} 缺少返回顶部按钮`).toContain('id="back-to-top"');
      }
      // 简历正文来自后台可编辑的 resume.json，页面不能把这些文案写死
      const resumeData = JSON.parse(readFileSync('src/data/resume.json', 'utf8')) as {
        intro: { title: string };
        workHistory: { team: string }[];
        contactHeading: string;
      };
      const resumePage = readFileSync('dist/resume/index.html', 'utf8');
      expect(resumePage).toContain(resumeData.intro.title);
      expect(resumePage).toContain(resumeData.workHistory[0]!.team);
      expect(resumePage).toContain(resumeData.contactHeading);

      expect(screenshotProject).toContain('data-screenshot-scrub');
      expect(scripts).toContain('--screenshot-local');
      expect(scripts).toContain('--screenshot-progress');
      // 目录 scroll spy 使用 getBoundingClientRect 而非 offsetTop，避免嵌套标题定位错误
      expect(article).toContain('data-toc-link');
      expect(article).toMatch(/aria-current.{0,6}location/);
    });

  });

  describe('3. 空和失败怎么处理：noindex、SRI 与匿名接口移除', () => {
    it('counts screenshot HTML elements without counting inline selector strings', () => {
      const html = [
        '<script>document.querySelectorAll("[data-screenshot-thumbnail]")</script>',
        '<section data-project-screenshots></section>',
        '<dialog data-screenshot-dialog></dialog>',
        '<button data-screenshot-thumbnail></button>',
      ].join('');

      expect(countOpeningTagsWithAttribute(html, 'section', 'data-project-screenshots')).toBe(1);
      expect(countOpeningTagsWithAttribute(html, 'dialog', 'data-screenshot-dialog')).toBe(1);
      expect(countOpeningTagsWithAttribute(html, 'button', 'data-screenshot-thumbnail')).toBe(1);
    });

    it('ships the Sveltia CMS entry with a GitHub backend config', () => {
      expect(existsSync('dist/admin/index.html')).toBe(true);
      expect(existsSync('dist/admin/config.yml')).toBe(true);

      const admin = readFileSync('dist/admin/index.html', 'utf8');
      expect(admin).toContain('@sveltia/cms');
      expect(admin).toContain('integrity="sha384-');
      expect(admin).toContain('crossorigin="anonymous"');
      expect(admin).toContain('name="robots" content="noindex, nofollow"');

      const config = readFileSync('dist/admin/config.yml', 'utf8');
      expect(config).toContain('name: github');
      expect(config).toContain('repo: vo520/field-notes');
      expect(config).toContain('folder: src/content/articles');
      expect(config).toContain('folder: src/content/projects');
      expect(config).toContain('media_folder: public/images/uploads');

      // 后台保存项目时通过 preSave 钩子校验分类；规则被拆到独立 chunk，需一并扫描
      const adminScript = [...admin.matchAll(/<script[^>]+src="([^"]+)"/g)]
        .map((match) => match[1]!)
        .filter((src) => src.startsWith('/_astro/'))
        .map((src) => readFileSync(`dist${src}`, 'utf8'))
        .join('\n');
      const adminChunks = readdirSync('dist/_astro')
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFileSync(`dist/_astro/${file}`, 'utf8'))
        .join('\n');
      const adminCode = `${adminScript}\n${adminChunks}`;

      expect(adminCode).toContain('preSave');
      expect(adminCode).toContain('不在项目分类清单里');
      // 校验请求有超时兜底：GitHub API 挂起不能让 preSave 一直 await 卡住保存。
      // 产物会压缩变量名，只能断言压缩后仍保留的特征（AbortController + abort + 8s 折叠值）。
      expect(adminCode).toContain('new AbortController');
      expect(adminCode).toMatch(/\.abort\(\),\s*\w+\)/);
      expect(adminCode).toContain('8e3');

      // 校验脚本读取仓库时用的 repo/branch 由后台配置注入到 body，
      // 不能再在 JS 里抄一份常量——否则改了后台配置后校验会读错仓库。
      const repo = /repo:\s*(\S+)/.exec(config)?.[1];
      const branch = /branch:\s*(\S+)/.exec(config)?.[1];
      expect(repo).toBeTruthy();
      expect(branch).toBeTruthy();
      expect(admin).toContain(`data-cms-repo="${repo}"`);
      expect(admin).toContain(`data-cms-branch="${branch}"`);
      expect(adminCode).toContain('dataset.cmsRepo');
      expect(adminCode).toContain('dataset.cmsBranch');
      expect(adminCode).not.toContain(`'${repo}'`);
      // 树响应被截断时放弃校验，不用不完整清单判断分类能否删除
      expect(adminCode).toContain('truncated');
    });

    it('ships the moderation entry linking each page to its GitHub discussion', () => {
      expect(existsSync('dist/admin/review/index.html')).toBe(true);

      const review = readFileSync('dist/admin/review/index.html', 'utf8');
      expect(review).toContain('name="robots" content="noindex"');
      expect(review).toContain('https://github.com/vo520/field-notes/discussions');
      expect(review).toContain('global-guestbook');

      const [firstArticle] = visibleMarkdownSlugs('src/content/articles');
      const [firstProject] = publishedProjectSlugs;
      for (const term of [`/articles/${firstArticle}/`, `/projects/${firstProject}/`, '/guestbook/']) {
        expect(review, term).toContain(term);
      }
    });

    it('removes the anonymous comment API and keeps public Giscus configuration', () => {
      const envExample = readFileSync('.env.example', 'utf8');
      const envTypes = readFileSync('src/env.d.ts', 'utf8');
      const wrangler = readFileSync('wrangler.jsonc', 'utf8');

      expect(existsSync('src/components/GiscusComments.astro')).toBe(true);
      expect(existsSync('src/components/Comments.astro')).toBe(false);
      expect(existsSync('functions/api/comments.ts')).toBe(false);
      expect(envExample).toContain('PUBLIC_GISCUS_REPO=vo520/field-notes');
      expect(envTypes).toContain('PUBLIC_GISCUS_REPO');
      expect(wrangler).not.toContain('COMMENTS_DB');
    });

  });

  describe('4. 界面为什么这样排版：OG 覆盖与搜索/订阅结构', () => {
    it('points every page og:image at an existing absolute asset', () => {
      let pagesWithOgImage = 0;

      for (const file of listHtmlFiles('dist')) {
        const html = readFileSync(file, 'utf8');
        const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
        const twitterImage = html.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1];

        // CMS 入口页是 Sveltia 的静态壳，不走 BaseLayout，没有社交图元信息。
        if (!ogImage) continue;
        pagesWithOgImage += 1;

        expect(twitterImage, file).toBe(ogImage);
        const url = new URL(ogImage);
        expect(url.origin, file).toBe(siteOrigin);
        const assetPath = join('dist', decodeURIComponent(url.pathname));
        expect(existsSync(assetPath), `${file} → ${url.pathname}`).toBe(true);
        expectValidImage(assetPath, url.pathname);
      }

      expect(pagesWithOgImage).toBe(listHtmlFiles('dist').length - 1);
    });

    it('publishes every tech stack as a reachable page without polluting search', () => {
      const graph = readFileSync('dist/stacks/index.html', 'utf8');
      const slugs = [...graph.matchAll(/href="\/stacks\/([^/]+)\/"/g)].map((match) => match[1]!);

      expect(slugs.length).toBeGreaterThan(0);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const slug of slugs) {
        const path = `dist/stacks/${slug}/index.html`;
        expect(existsSync(path), `技术栈专题页缺失：${slug}`).toBe(true);
        // 聚合页没有原创正文，不进 Pagefind，否则会淹没真实文章/项目的搜索结果
        expect(readFileSync(path, 'utf8')).toContain('data-pagefind-ignore');
      }
    });

    it('builds search, feeds, sitemap, and about outputs', () => {
      expect(existsSync('dist/search/index.html')).toBe(true);
      expect(existsSync('dist/about/index.html')).toBe(true);
      expect(existsSync('dist/rss.xml')).toBe(true);
      expect(existsSync('dist/sitemap-index.xml')).toBe(true);
      expect(existsSync('dist/pagefind/pagefind.js')).toBe(true);

      const search = readFileSync('dist/search/index.html', 'utf8');
      // SearchPanel 脚本已被 Astro 打包外链，改为在 bundle 中核验动态导入
      expect(readBundledScripts()).toContain('/pagefind/pagefind.js');
      expect(search).toContain('name="robots" content="noindex"');
      expect(search).toContain('min-width:44px');
      expect(search).toContain('min-height:44px');
      expect(search).not.toContain('__VITE_PRELOAD__');

      const rss = readFileSync('dist/rss.xml', 'utf8');
      const siteData = JSON.parse(readFileSync('src/data/site.json', 'utf8'));
      const rssTitle = String(siteData.rssTitleTemplate).replace('{name}', String(siteData.name));
      expect(rss).toContain(`<title>${rssTitle}</title>`);
      // 作者来自后台，改姓名后订阅侧必须同步；标题则由 rssTitleTemplate 控制而非 site.title
      expect(rss).toContain(`<author>${siteData.author.name}</author>`);
      expect(rss).toContain('<lastBuildDate>');
      expect(rss).not.toContain('field-notes.pages.dev');
      // 条目数必须与生产构建可见的文章数一致（草稿不入 RSS）
      expect(rss.match(/<item>/g) ?? []).toHaveLength(visibleMarkdownSlugs('src/content/articles').length);

      // 每个有项目的分类都要有静态分类页，避免筛选条链接指向 404
      const projectCategories = new Set(publicProjects.map(({ category }) => category));
      for (const category of projectCategories) {
        expect(
          existsSync(`dist/projects/categories/${toTagSlug(category)}/index.html`),
          category,
        ).toBe(true);
      }

      const sitemap = readdirSync('dist')
        .filter((name) => name.startsWith('sitemap-') && name.endsWith('.xml'))
        .map((name) => readFileSync(join('dist', name), 'utf8'))
        .join('');
      expect(sitemap).toContain(`/projects/${publicProjects[0]!.slug}/`);
      expect(sitemap).toContain('/tags/');
      expect(sitemap).not.toContain('/search/');
      expect(sitemap).not.toContain('/admin/');

      const pagefindEntry = readFileSync('dist/pagefind/pagefind-entry.json', 'utf8');
      // 索引页数随内容增减，按实际带 data-pagefind-body 的页面数校验，避免每次增删文章都要改死数字
      const indexedPages = listHtmlFiles('dist').filter(
        (file) => readFileSync(file, 'utf8').includes('data-pagefind-body'),
      ).length;
      expect(pagefindEntry).toContain(`"page_count":${indexedPages}`);
    });

  });

  describe('5. 最后代码怎么落地：评论宿主接入三类页面', () => {
    it('builds GitHub-authenticated Giscus hosts for articles, projects, and the guestbook', () => {
      expect(existsSync('dist/guestbook/index.html')).toBe(true);

      const guestbook = readFileSync('dist/guestbook/index.html', 'utf8');
      const [firstArticle] = visibleMarkdownSlugs('src/content/articles');
      const article = readFileSync(`dist/articles/${firstArticle}/index.html`, 'utf8');
      const [firstProject] = publishedProjectSlugs;
      const project = readFileSync(`dist/projects/${firstProject}/index.html`, 'utf8');
      expect(guestbook).toContain('data-giscus-host');
      expect(guestbook).toMatch(/<span class="guestbook-title-line"[^>]*>登录 GitHub，<\/span>/);
      expect(guestbook).toMatch(/<span class="guestbook-title-line"[^>]*>留下消息。<\/span>/);
      expect(guestbook).toContain('data-mapping="specific"');
      expect(guestbook).toContain('data-term="global-guestbook"');
      expect(article).toContain('data-giscus-host');
      expect(article).toContain('data-mapping="pathname"');
      expect(project).toContain('data-giscus-host');
      expect(project).toContain('data-mapping="pathname"');
      for (const page of [guestbook, article, project]) {
        expect(page).toContain('登录 GitHub 后即可参与');
        // Giscus 加载脚本已打包外链，在 bundle 中核验占位 URL
        expect(readBundledScripts()).toContain('https://giscus.app/client.js');
        expect(page).not.toContain('data-comment-form');
        expect(page).not.toContain('无需登录即可参与');
      }
    });

  });

});
