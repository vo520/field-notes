import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { siteSchema } from '../src/lib/site-schema';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

/** 对象的叶子路径集合；数组用 [] 归一，便于与后台字段路径比对 */
function leafPaths(value: unknown, prefix = ''): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(value)) {
    for (const item of value) for (const path of leafPaths(item, `${prefix}[]`)) out.add(path);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      for (const path of leafPaths(child, prefix ? `${prefix}.${key}` : key)) out.add(path);
    }
    return out;
  }
  out.add(prefix);
  return out;
}

/** 后台字段路径集合；list 的子项同样用 [] 归一 */
function cmsFieldPaths(fields: unknown, prefix = ''): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(fields)) return out;
  for (const field of fields as Record<string, unknown>[]) {
    const name = field.name as string;
    const path = prefix ? `${prefix}.${name}` : name;
    if (Array.isArray(field.fields)) {
      // fields: 复数——列表项/对象是带命名字段的结构
      const childPrefix = field.widget === 'list' ? `${path}[]` : path;
      for (const child of cmsFieldPaths(field.fields, childPrefix)) out.add(child);
    } else if (field.field) {
      // field: 单数——Sveltia 列表项直接存值，没有子字段路径
      out.add(`${path}[]`);
    } else {
      // 没有子字段定义的 list（如 guestbook.rules）存的是字符串数组，同样归一到 []
      out.add(field.widget === 'list' ? `${path}[]` : path);
    }
  }
  return out;
}

function readStyleSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return readStyleSources(entryPath);
    return /\.(astro|css)$/.test(entry.name) ? [entryPath] : [];
  });
}

describe('后台到前端的数据契约', () => {
  it('后台可编辑的每个字段都能被 schema 接受，site.json 没有被后台漏配的字段', () => {
    const config = parseYaml(read('public/admin/config.yml')) as {
      collections: { name: string; files: { fields: unknown }[] }[];
    };
    const settings = config.collections.find((collection) => collection.name === 'settings');
    expect(settings, '后台缺少 settings 集合').toBeDefined();

    const cmsFields = cmsFieldPaths(settings!.files[0]!.fields);
    const siteRaw = JSON.parse(read('src/data/site.json')) as unknown;
    const actualFields = leafPaths(siteRaw);
    const schemaFields = leafPaths(siteSchema.parse(siteRaw));

    expect([...cmsFields].sort()).toEqual([...actualFields].sort());
    expect([...schemaFields].sort()).toEqual([...actualFields].sort());
  });

  it('后台可改但条件不满足就不显示的字段，都有明确提示', () => {
    // 这些字段填了才渲染对应区块；不提示的话编辑者改完文案却看不到任何变化
    const config = parseYaml(read('public/admin/config.yml')) as {
      collections: { name: string; fields?: unknown; files?: { fields: unknown }[] }[];
    };
    const projects = config.collections.find((collection) => collection.name === 'projects');
    const fields = projects!.fields as Record<string, unknown>[];

    const hintOf = (name: string): string => {
      const field = fields.find((item) => item.name === name);
      return String(field?.hint ?? '');
    };

    for (const name of ['modules', 'roles', 'workflow', 'metrics', 'integrations', 'repositories']) {
      expect(hintOf(name), `${name} 应提示不填则不显示`).toMatch(/不显示|留空/);
    }
  });

  it('后台勾选的文章精选在列表与首页都能改变卡片样式', () => {
    // featured 是文章后台的布尔开关，卡片组件已支持样式态；调用方不传就永远不生效，
    // 编辑者勾选后看不到任何变化。两处文章卡片入口都必须把字段接到组件。
    for (const page of ['src/pages/articles/index.astro', 'src/pages/index.astro']) {
      expect(read(page), `${page} 未接文章 featured`).toContain('featured={article.data.featured}');
    }
  });

  it('项目更新日期同时进入页面元信息与结构化数据', () => {
    // 项目的 updatedAt 与文章一样可在后台填写；只存不显示会让人以为保存失败，
    // 搜索引擎也拿不到 dateModified。
    const layout = read('src/layouts/ProjectLayout.astro');

    expect(layout).toContain('dateModified: data.updatedAt.toISOString()');
    expect(layout).toContain('{data.updatedAt &&');
    expect(layout).toContain('siteConfig.articlePage.updatedPrefix');
  });

  it('文章封面既进 JSON-LD 也在页面上渲染，不会出现上传白费', () => {
    const articleLayout = read('src/layouts/ArticleLayout.astro');
    const siteData = JSON.parse(read('src/data/site.json')) as {
      articlePage: { coverAltTemplate: string };
    };

    expect(articleLayout).toContain('class="article-cover"');
    expect(articleLayout).toContain('data.cover');
    expect(articleLayout).toContain('siteConfig.articlePage.coverAltTemplate');
    expect(siteData.articlePage.coverAltTemplate).toContain('{title}');
  });

  it('后台保存校验的仓库定位来自 config.yml，不出现第二份硬编码', () => {
    const config = parseYaml(read('public/admin/config.yml')) as {
      backend: { repo: string; branch: string };
    };
    const adminPage = read('src/pages/admin/index.astro');

    expect(adminPage).toContain('data-cms-repo={cmsRepo}');
    expect(adminPage).toContain('data-cms-branch={cmsBranch}');
    expect(adminPage).toContain("cmsConfig.backend?.repo");
    // 仓库名与分支只允许出现在 config.yml，后台页面不能再抄一份常量
    expect(adminPage).not.toContain(`'${config.backend.repo}'`);
    expect(adminPage).not.toContain(`'${config.backend.branch}'`);
    // 树响应截断时必须放弃校验，不能拿不完整项目清单去做删除分类的反向判断
    expect(adminPage).toContain('tree.truncated');
  });

  it('同会话刚保存的分类/项目不会因 60 秒旧缓存被误拦', () => {
    // Sveltia 是 SPA，保存后不刷新页面。分类缓存与项目缓存只缓存 60 秒，
    // 刚新增分类就给项目引用、刚建项目就让文章关联时，旧快照会把合法值判成非法。
    // 校验失败必须作废缓存直读一次，且直读请求不能吃浏览器 CDN 旧响应。
    const adminPage = read('src/pages/admin/index.astro');

    // 两个校验各有一条「失败后清缓存重试」路径
    expect(adminPage).toContain('siteCategoriesCache = null;');
    expect(adminPage).toContain('projectUsageCache = null;');
    expect(adminPage).toContain('const fresh = await loadCategories()');
    expect(adminPage).toContain('const fresh = await loadProjectCategories()');
    // 失败重试若命中 CDN 旧缓存仍会误拦，直读必须禁用 HTTP 缓存
    expect(adminPage).toContain("cache: 'no-store'");
  });
});

describe('light monochrome layout', () => {
  it('keeps the article/project association wired through both detail layouts', () => {
    const articleLayout = read('src/layouts/ArticleLayout.astro');
    const projectLayout = read('src/layouts/ProjectLayout.astro');
    const articlePage = read('src/pages/articles/[id].astro');
    const projectPage = read('src/pages/projects/[id].astro');

    expect(articleLayout).toContain('ProjectCard');
    expect(articleLayout).toContain('project.id');
    expect(projectLayout).toContain('relatedArticles');
    expect(projectLayout).toContain('type="article"');
    expect(articlePage).toContain('findArticleProject');
    expect(articlePage).toContain('getArticleProjectIssue');
    expect(articlePage).toContain('groupArticlesIntoSeries');
    expect(articlePage).toContain('getArticlePager');
    expect(articlePage).toContain('getSeriesAwareRelated');
    expect(projectPage).toContain('getArticlesForProject');
  });

  it('renders article series groups and the in-series badge', () => {
    const articlesIndex = read('src/pages/articles/index.astro');
    const articleLayout = read('src/layouts/ArticleLayout.astro');

    expect(articlesIndex).toContain('groupArticlesIntoSeries');
    expect(articlesIndex).toContain('seriesTitleTemplate');
    expect(articlesIndex).toContain('seriesPositionTemplate');
    expect(articleLayout).toContain('seriesTemplate');
    expect(articleLayout).toContain('class="article-series"');
  });

  it('defines the global rhythm, container widths, and typography contract', () => {
    const globalStyles = read('src/styles/global.css');
    const header = read('src/components/Header.astro');

    expect(globalStyles).toContain('--content: 1280px;');
    expect(globalStyles).toContain('--content-narrow: 960px;');
    expect(globalStyles).toContain('--prose: 760px;');
    expect(globalStyles).toContain('--header-height: 64px;');
    expect(globalStyles).toContain('--radius-pill: 999px;');
    expect(globalStyles).toContain('text-wrap: balance;');
    expect(globalStyles).toContain('overflow-wrap: anywhere;');
    expect(globalStyles).toContain('width: min(calc(100% - 48px), var(--content));');
    expect(header).toContain('min-height: 44px;');
  });

  it('keeps the header as a floating glass pill', () => {
    const header = read('src/components/Header.astro');

    expect(header).toContain('class="header-pill"');
    expect(header).toContain('width: min(calc(100% - 32px), var(--content));');
    expect(header).toContain('border-radius: var(--radius-sm);');
    expect(header).toContain('background: var(--header-glass);');
    expect(header).toContain('backdrop-filter: blur(18px) saturate(140%);');
  });

  it('lays the home hero out as a gray studio block with a stats column', () => {
    const home = read('src/styles/home.css');
    const heroRule = home.match(/\.hero-studio\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(heroRule).toContain('padding-block: clamp(72px, 9vw, 128px);');
    expect(heroRule).toContain('background: var(--surface-soft);');
    expect(home).toContain('grid-template-columns: minmax(0, 7fr) minmax(300px, 5fr);');
    expect(home).toContain('font-size: clamp(3.5rem, 7vw, 6rem);');
    expect(home).toMatch(/\.hero-studio__stats li \{[^}]*border-top: 1px solid var\(--border-strong\);/);
  });

  it('releases the hero stats into one column on narrow screens', () => {
    const home = read('src/styles/home.css');
    const mobile = home.slice(home.indexOf('@media (max-width: 768px) {'));

    expect.soft(mobile).toContain('font-size: clamp(2.5rem, 10vw, 2.75rem);');
    expect.soft(mobile).toMatch(/\.hero-studio__stats \{[^}]*grid-template-columns: 1fr;/);
  });

  it('uses white cards with a hairline border and scale-only image hover', () => {
    const card = read('src/components/ProjectCard.astro');
    const contentCard = read('src/components/ContentCard.astro');

    expect(card).toContain('border: 1px solid var(--border);');
    expect(card).toContain('border-radius: var(--radius-md);');
    expect(card).toContain('background: var(--surface);');
    expect(card).toContain('transform: scale(1.04);');
    expect(card).toContain('border-radius: var(--radius-pill);');
    expect(card).not.toContain('box-shadow');
    expect(contentCard).toContain('background: var(--surface);');
    expect(contentCard).toContain('background: var(--surface-soft);');
  });

  it('keeps project directory cards in one shared two-column grid', () => {
    const page = read('src/pages/projects/index.astro');
    const gallery = read('src/components/ProjectGallery.astro');

    expect(page).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(gallery).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it('uses a restrained split project hero and prose-aligned comments', () => {
    const layout = read('src/layouts/ProjectLayout.astro');

    expect(layout).toContain('grid-template-columns: minmax(0, 8fr) minmax(280px, 4fr);');
    expect(layout).toContain('font-size: clamp(2.5rem, 5vw, 3.6rem);');
    expect(layout).toContain('max-width: var(--prose);');
    expect(layout).toContain('<GiscusComments mapping="pathname" />');
    expect(layout).not.toContain('data-reveal');
  });

  it('caps the project detail title at 44px on narrow screens', () => {
    const layout = read('src/layouts/ProjectLayout.astro');
    const mobile = layout.slice(layout.indexOf('@media (max-width: 768px) {'));

    expect(mobile).toContain('font-size: clamp(2.5rem, 10vw, 2.75rem);');
  });

  it('keeps screenshot galleries readable with a light device frame', () => {
    const gallery = read('src/components/ProjectScreenshots.astro');
    const mobile = gallery.slice(gallery.indexOf('@media (max-width: 768px) {'));

    expect(gallery).toContain('grid-template-columns: minmax(220px, 4fr) minmax(0, 8fr);');
    expect(gallery).toContain('max-width: 380px;');
    expect(gallery).toContain('grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));');
    expect(gallery).toContain('aspect-ratio: var(--screenshot-ratio, 16 / 10);');
    expect(gallery).toContain('border: 1px solid var(--border-strong);');
    expect(gallery).toContain('border-radius: 22px;');
    expect(gallery).not.toContain('#101d32');
    expect(gallery).not.toContain('data-reveal');
    expect(mobile).toMatch(/\.project-screenshots \{[^}]*grid-template-columns: 1fr;/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnails \{[^}]*grid-auto-flow: column;/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnails \{[^}]*grid-auto-columns: minmax\(132px, 44vw\);/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnails \{[^}]*max-width: 100%;/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnails \{[^}]*overflow-x: auto;/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnails \{[^}]*scroll-snap-type: x proximity;/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnail \{[^}]*scroll-snap-align: start;/);
  });

  it('integrates the guestbook explanation and GitHub discussion in one split layout', () => {
    const guestbook = read('src/pages/guestbook.astro');
    const comments = read('src/components/GiscusComments.astro');

    expect(guestbook).toContain('grid-template-columns: minmax(240px, 4fr) minmax(0, 8fr);');
    expect(guestbook).toContain('font-size: clamp(2.4rem, 4.6vw, 3.2rem);');
    expect(guestbook).toContain('mapping="specific" term="global-guestbook"');
    expect(comments).toContain('siteConfig.ui.comments');
    expect(read('src/data/site.json')).toContain('登录 GitHub 后即可参与');
  });

  it('caps the guestbook title at 44px on narrow screens', () => {
    const guestbook = read('src/pages/guestbook.astro');
    const mobile = guestbook.slice(guestbook.indexOf('@media (max-width: 768px) {'));

    expect(mobile).toContain('font-size: clamp(2.5rem, 10vw, 2.75rem);');
  });

  it('keeps every responsive breakpoint on the shared 480/640/768/1024 scale', () => {
    const allowed = new Set([480, 640, 768, 1024]);
    const breakpoints = readStyleSources('src').flatMap((file) =>
      [...read(file).matchAll(/@media \(max-width: (\d+)px\)/g)].map((match) => ({
        file,
        value: Number(match[1]),
      })),
    );

    expect(breakpoints.length).toBeGreaterThan(0);
    for (const { file, value } of breakpoints) {
      expect(allowed.has(value), `${file} 使用了未统一的断点 ${value}px`).toBe(true);
    }
  });
});
