import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readProjectFrontmatter } from './_helpers/frontmatter';

const publicProjects = [
  { slug: 'dobotcn', title: 'DOBOT 官网中文版', cover: 'dobotcn.svg' },
  { slug: 'doboten', title: 'DOBOT 官网英文版', cover: 'doboten.svg' },
  {
    slug: 'free-video-downloader',
    title: 'AI 视频下载总结器',
    cover: 'free-video-downloader.svg',
    repoUrl: 'https://github.com/vo520/free-video-downloader',
  },
  { slug: 'geoflow', title: 'GEOFlow 部署实践', cover: 'geoflow.svg', repoUrl: 'https://github.com/vo520/GEOFlow' },
  { slug: 'mydobot-ui', title: 'MY-DOBOT 用户中心', cover: 'mydobot-ui.svg' },
  { slug: 'navmate', title: 'NavMate 导航系统', cover: 'navmate.svg', repoUrl: 'https://github.com/vo520/NavMate' },
  { slug: 'octobercms', title: 'October CMS 本地化部署', cover: 'octobercms.svg' },
  { slug: 'omnivision-brand', title: 'Omnivision 品牌官网前端', cover: 'omnivision-brand.svg' },
  { slug: 'robot-forum-miniapp', title: '机器人论坛小程序', cover: 'robot-forum-miniapp.svg' },
  { slug: 'trae-cn-config', title: 'Trae CN 配置同步', cover: 'trae-cn-config.svg' },
  { slug: 'yuejiang-news-site', title: '越疆机器人资讯管理系统', cover: 'yuejiang-news-site.svg' },
  { slug: 'zongshibupin-index', title: '宗师部品门店价格表', cover: 'zongshibupin-index.svg' },
] as const;

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

function listHtmlFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      return listHtmlFiles(entryPath);
    }

    return entry.isFile() && extname(entry.name) === '.html' ? [entryPath] : [];
  });
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
  const isSvg = label.endsWith('.svg') && text.includes('<svg');

  expect(isPng || isJpeg || isSvg, `${label} must be a PNG, JPEG, or SVG`).toBe(true);
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
    for (const slug of ['mydobot-ui', 'yuejiang-news-site']) {
      expect(home).toContain(`/projects/${slug}/`);
    }
    expect(home).toContain('https://blog.ytn520.top');
  });

  it('builds all twelve public project details with their real covers and repositories', () => {
    expect(existsSync('dist/projects/index.html')).toBe(true);

    const projects = readFileSync('dist/projects/index.html', 'utf8');
    expect(projects).toContain('data-project-filter');

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

      if ('repoUrl' in project) {
        expect(detail).toContain(project.repoUrl);
      } else {
        expect(detail).toContain('私有仓库 · 未公开');
      }
    }

    obsoleteProjectSlugs.forEach((slug) => {
      expect(existsSync(`dist/projects/${slug}/index.html`), slug).toBe(false);
    });
  });

  it('builds the expected 51 HTML pages including the CMS and moderation entries', () => {
    expect(listHtmlFiles('dist')).toHaveLength(51);
  });

  it('ships the Sveltia CMS entry with a GitHub backend config', () => {
    expect(existsSync('dist/admin/index.html')).toBe(true);
    expect(existsSync('dist/admin/config.yml')).toBe(true);

    const admin = readFileSync('dist/admin/index.html', 'utf8');
    expect(admin).toContain('@sveltia/cms');
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

    for (const term of ['/articles/redisearch-result-set/', '/projects/dobotcn/', '/guestbook/']) {
      expect(review, term).toContain(term);
    }
  });

  it('builds article details and tag indexes with a page-level h1', () => {
    expect(existsSync('dist/articles/redisearch-result-set/index.html')).toBe(true);
    expect(existsSync('dist/tags/index.html')).toBe(true);
    expect(existsSync('dist/tags/git/index.html')).toBe(true);

    const article = readFileSync('dist/articles/redisearch-result-set/index.html', 'utf8');
    expect(article).toContain('文章目录');
    expect(article).toContain('"@type":"BlogPosting"');

    const articlesIndex = readFileSync('dist/articles/index.html', 'utf8');
    const tagsIndex = readFileSync('dist/tags/index.html', 'utf8');
    const tagIndex = readFileSync('dist/tags/git/index.html', 'utf8');
    expect(articlesIndex).toMatch(/<h1[^>]*>文章与实践记录<\/h1>/);
    expect(tagsIndex).toMatch(/<h1[^>]*>按标签浏览<\/h1>/);
    expect(tagsIndex).toContain('href="/tags/git/"');
    expect(tagIndex).toMatch(/<h1[^>]*># Git<\/h1>/);
    expect(tagIndex).toContain('href="/tags/"');
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
    expect([...homeSlugs]).toHaveLength(3);
    expect(homeSlugs.has('mydobot-ui')).toBe(true);
    expect(homeSlugs.has('yuejiang-news-site')).toBe(true);

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
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const frontmatter = readProjectFrontmatter(entry.name.replace(/\.md$/, ''));
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

    const sitemap = readdirSync('dist')
      .filter((name) => name.startsWith('sitemap-') && name.endsWith('.xml'))
      .map((name) => readFileSync(join('dist', name), 'utf8'))
      .join('');
    expect(sitemap).toContain('/projects/navmate/');
    expect(sitemap).toContain('/tags/');
    expect(sitemap).not.toContain('/search/');
    expect(sitemap).not.toContain('/admin/');

    const pagefindEntry = readFileSync('dist/pagefind/pagefind-entry.json', 'utf8');
    expect(pagefindEntry).toContain('"page_count":47');
  });

  it('builds GitHub-authenticated Giscus hosts for articles, projects, and the guestbook', () => {
    expect(existsSync('dist/guestbook/index.html')).toBe(true);

    const guestbook = readFileSync('dist/guestbook/index.html', 'utf8');
    const article = readFileSync('dist/articles/redisearch-result-set/index.html', 'utf8');
    const project = readFileSync('dist/projects/mydobot-ui/index.html', 'utf8');
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
    expect(robots).toContain('https://blog.ytn520.top/sitemap-index.xml');
    expect(robots).toContain('Disallow: /admin/');
  });
});
