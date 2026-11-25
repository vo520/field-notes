import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { toTagSlug } from '../src/lib/content';
import { readMarkdownFrontmatter, readProjectFrontmatter } from './_helpers/frontmatter';

// 项目清单从内容目录派生（跳过 draft），避免 CMS 增删项目后测试里的硬编码快照失效
const publicProjects = markdownSlugs('src/content/projects')
  .map((slug) => ({ slug, frontmatter: readProjectFrontmatter(slug) }))
  .filter(({ frontmatter }) => frontmatter.draft !== true)
  .map(({ slug, frontmatter }) => {
    const cover = String(frontmatter.cover ?? '');

    return {
      slug,
      title: String(frontmatter.title ?? slug),
      cover: cover.split('/').pop() ?? cover,
      repoUrl: typeof frontmatter.repoUrl === 'string' ? frontmatter.repoUrl : undefined,
      featured: frontmatter.featured === true,
      publishedAt: String(frontmatter.publishedAt ?? ''),
    };
  });

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

/** 读取某个内容集合的条目 id，避免把具体文章/项目写死在断言里。 */
function markdownSlugs(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => /\.mdx?$/.test(name))
    .map((name) => name.replace(/\.mdx?$/, ''))
    .toSorted();
}

/** 生产构建中可见的条目：与 isVisibleEntry(entry, true) 一致，跳过 draft: true。 */
function visibleMarkdownSlugs(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => /\.mdx?$/.test(name))
    .filter((name) => readMarkdownFrontmatter(join(dir, name)).draft !== true)
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

describe('static site build', () => {
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

      expect(existsSync(detailPath), detailPath).toBe(true);
      expect(existsSync(`dist/images/projects/${cover}`), cover).toBe(true);
      expectValidImage(`dist/images/projects/${cover}`, cover);
      const detail = readFileSync(detailPath, 'utf8');
      expect(projects).toContain(title);
      expect(projects).toContain(`/images/projects/${cover}`);
      expect(detail).toContain('project-showcase');
      expect(detail).toContain(`/images/projects/${cover}`);
      expect(detail).toContain('property="og:image"');
      expect(detail).toContain(`/og/projects/${slug}.png`);
      expect(existsSync(`dist/og/projects/${slug}.png`), `og/projects/${slug}.png`).toBe(true);
      expect(detail).toContain('"@type":"SoftwareSourceCode"');

      const frontmatter = readProjectFrontmatter(slug);
      const screenshots = (frontmatter.screenshots ?? []) as Array<{ src: string }>;
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
  });

  it('builds one HTML page per content entry and the fixed static entries', () => {
    for (const page of ['index.html', '404.html']) {
      expect(existsSync(`dist/${page}`), page).toBe(true);
    }
    for (const page of ['about', 'archive', 'articles', 'guestbook', 'projects', 'projects/categories', 'search', 'tags', 'admin']) {
      expect(existsSync(`dist/${page}/index.html`), page).toBe(true);
    }
    expect(existsSync('dist/admin/review/index.html')).toBe(true);

    for (const [collection, dir] of [['articles', 'articles'], ['projects', 'projects']] as const) {
      const slugs = visibleMarkdownSlugs(`src/content/${collection}`);

      expect(slugs.length, `${collection} entries`).toBeGreaterThan(0);
      for (const slug of slugs) {
        expect(existsSync(`dist/${dir}/${slug}/index.html`), `${collection}/${slug}`).toBe(true);
      }
    }
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
  });

  it('ships the moderation entry linking each page to its GitHub discussion', () => {
    expect(existsSync('dist/admin/review/index.html')).toBe(true);

    const review = readFileSync('dist/admin/review/index.html', 'utf8');
    expect(review).toContain('name="robots" content="noindex"');
    expect(review).toContain('https://github.com/vo520/field-notes/discussions');
    expect(review).toContain('global-guestbook');

    const [firstArticle] = visibleMarkdownSlugs('src/content/articles');
    const [firstProject] = visibleMarkdownSlugs('src/content/projects');
    for (const term of [`/articles/${firstArticle}/`, `/projects/${firstProject}/`, '/guestbook/']) {
      expect(review, term).toContain(term);
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

  it('puts only the three selected project cards in the home product catalog', () => {
    const home = readFileSync('dist/index.html', 'utf8');

    const heroStart = home.indexOf('class="hero-studio"');
    const asideStart = home.indexOf('class="open-source-promise"');
    const catalogStart = home.indexOf('data-home-project-catalog');

    expect(heroStart).toBeGreaterThan(-1);
    expect(asideStart).toBeGreaterThan(heroStart);
    expect(catalogStart).toBeGreaterThan(asideStart);
    expect(home.slice(catalogStart)).not.toContain('data-project-category-grid');

    const homeSlugs = projectSlugsIn(home.slice(catalogStart));
    expect(homeProjectSlugs).toHaveLength(3);
    expect([...homeSlugs].toSorted()).toEqual(homeProjectSlugs.toSorted());

    for (const slug of homeSlugs) {
      const project = publicProjects.find((entry) => entry.slug === slug);
      expect(project, slug).toBeDefined();
      expect(home.slice(catalogStart)).toContain(`/images/projects/${project!.cover}`);
    }
  });

  it('builds product category filters only for categories that have projects', () => {
    const home = readFileSync('dist/index.html', 'utf8');
    const projects = readFileSync('dist/projects/index.html', 'utf8');
    const categories = [
      '个人品牌', '电商平台', '社区服务', '企业官网', '门店经营', '供应链管理', '教育培训',
      '物流运输', '医疗健康', '人力资源', '财务管理', '销售管理', '合同管理', '物业服务',
      '客户服务', '文体活动', '零售餐饮', '生活服务', '工业能源', '售后服务', '采购供应链',
      '旅游住宿', '内容创作', '法律服务', '场馆运营',
    ];

    expect(home).toContain(`data-project-count="${publicProjects.length}"`);
    expect(projects).toContain('data-project-catalog');
    expect(projects).toContain('来自 Gitee 与 GitHub 的项目');
    expect(projects).toContain('<h1');

    const counts = new Map<string, number>();
    for (const entry of readdirSync('src/content/projects', { withFileTypes: true })) {
      if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) continue;
      const frontmatter = readProjectFrontmatter(entry.name.replace(/\.mdx?$/, ''));
      const category = String(frontmatter.category);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }

    const present = categories.filter((category) => (counts.get(category) ?? 0) > 0);
    const absent = categories.filter((category) => (counts.get(category) ?? 0) === 0);

    expect(present.length).toBeLessThan(categories.length);
    expect(projects.match(/data-project-filter=/g)).toHaveLength(present.length + 1);

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

  it('builds search, feeds, sitemap, and about outputs', () => {
    expect(existsSync('dist/search/index.html')).toBe(true);
    expect(existsSync('dist/about/index.html')).toBe(true);
    expect(existsSync('dist/rss.xml')).toBe(true);
    expect(existsSync('dist/sitemap-index.xml')).toBe(true);
    expect(existsSync('dist/pagefind/pagefind.js')).toBe(true);

    const search = readFileSync('dist/search/index.html', 'utf8');
    expect(search).toContain("import('/pagefind/pagefind.js')");
    expect(search).toContain('name="robots" content="noindex"');
    expect(search).toContain('min-width:44px');
    expect(search).toContain('min-height:44px');
    expect(search).not.toContain('__VITE_PRELOAD__');

    const rss = readFileSync('dist/rss.xml', 'utf8');
    expect(rss).toContain('<lastBuildDate>');
    expect(rss).not.toContain('field-notes.pages.dev');
    // 条目数必须与生产构建可见的文章数一致（草稿不入 RSS）
    expect(rss.match(/<item>/g) ?? []).toHaveLength(visibleMarkdownSlugs('src/content/articles').length);

    // 每个有项目的分类都要有静态分类页，避免筛选条链接指向 404
    const projectCategories = new Set(
      publicProjects.map(({ slug }) => String(readProjectFrontmatter(slug).category)),
    );
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

  it('builds GitHub-authenticated Giscus hosts for articles, projects, and the guestbook', () => {
    expect(existsSync('dist/guestbook/index.html')).toBe(true);

    const guestbook = readFileSync('dist/guestbook/index.html', 'utf8');
    const [firstArticle] = visibleMarkdownSlugs('src/content/articles');
    const article = readFileSync(`dist/articles/${firstArticle}/index.html`, 'utf8');
    const [firstProject] = visibleMarkdownSlugs('src/content/projects');
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
      expect(page).toContain('https://giscus.app/client.js');
      expect(page).not.toContain('data-comment-form');
      expect(page).not.toContain('无需登录即可参与');
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

  it('publishes crawler and browser identity assets', () => {
    expect(existsSync('dist/robots.txt')).toBe(true);
    expect(existsSync('dist/favicon.svg')).toBe(true);

    const robots = readFileSync('dist/robots.txt', 'utf8');
    expect(robots).toContain(`${siteOrigin}/sitemap-index.xml`);
    expect(robots).toContain('Disallow: /admin/');
  });
});
