import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { resumeSchema } from '../src/lib/resume-schema';
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
  it('后台可编辑的每个字段都能被 schema 接受，所有站点模块与简历数据都没有漏配', () => {
    const config = parseYaml(read('public/admin/config.yml')) as {
      collections: { name: string; files: { file: string; fields: unknown }[] }[];
    };
    const settings = config.collections.find((collection) => collection.name === 'settings');
    expect(settings, '后台缺少 settings 集合').toBeDefined();

    // 站点信息按模块拆成多份后台文件；新增模块必须同时补进这里，否则测试直接失败
    const siteModules = [
      'site', 'chrome', 'home', 'about', 'articles', 'projects', 'discovery', 'admin',
    ] as const;
    const siteFiles = siteModules.map((name) => `src/data/${name}.json`);

    // 新增 settings 文件必须同时补上契约，否则后台能改但前端不认的字段会漏网
    expect(settings!.files.map((entry) => entry.file).sort()).toEqual(
      [...siteFiles, 'src/data/resume.json'].sort(),
    );

    for (const file of siteFiles) {
      const entry = settings!.files.find((item) => item.file === file);
      expect(entry, `后台缺少 ${file} 的配置`).toBeDefined();
      const cmsFields = cmsFieldPaths(entry!.fields);
      const actualFields = leafPaths(JSON.parse(read(file)) as unknown);
      expect([...cmsFields].sort(), `${file} 后台字段与数据不一致`).toEqual([...actualFields].sort());
    }

    const resumeEntry = settings!.files.find((item) => item.file === 'src/data/resume.json');
    const resumeRaw = JSON.parse(read('src/data/resume.json')) as unknown;
    expect([...cmsFieldPaths(resumeEntry!.fields)].sort()).toEqual([...leafPaths(resumeRaw)].sort());
    expect([...leafPaths(resumeSchema.parse(resumeRaw))].sort()).toEqual([...leafPaths(resumeRaw)].sort());

    // 单份模块不含完整 schema 所需的字段；合并后仍必须通过整站 schema，叶路径不能漂移
    const moduleData = siteFiles.map((file) => JSON.parse(read(file))) as Record<string, unknown>[];
    const topLevelKeys = moduleData.flatMap((data) => Object.keys(data));
    // 合并顺序由 site.ts 写死；顶层 key 重复会让后台某份文件的修改被静默覆盖
    expect(new Set(topLevelKeys).size, '站点模块之间不能有重复顶层字段').toBe(topLevelKeys.length);
    const merged = Object.assign({}, ...moduleData) as unknown;
    expect([...leafPaths(siteSchema.parse(merged))].sort()).toEqual([...leafPaths(merged)].sort());
  });

  it('分类清单的读取与保存校验都指向项目配置模块', () => {
    expect(read('src/lib/projects.ts')).toContain('../data/projects.json');
    const admin = read('src/pages/admin/index.astro');
    expect(admin).toContain('contents/src/data/projects.json');
    expect(admin).not.toContain('contents/src/data/site.json');
  });

  it('文章关联项目的后台校验与构建闸门口径一致', () => {
    const admin = read('src/pages/admin/index.astro');
    // 与 content.config.ts 的 loader 保持一致，不能漏掉 .mdx 项目
    expect(admin).toContain("/\\.mdx?$/.test(node.path)");
    // 草稿或未过发布红线的项目不算有效 slug，否则保存通过却静默丢失归属
    expect(admin).toContain("import { isPublishableProject } from '../../lib/publishing-rules'");
    expect(admin).toContain('project.published !== false');
    // 分类变化也会影响发布状态，失败重试必须同时作废两份缓存
    const guard = admin.slice(admin.indexOf('async function guardArticleProject'));
    expect(guard).toContain('siteCategoriesCache = null;');
    expect(guard).toContain('projectUsageCache = null;');
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
    const siteData = JSON.parse(read('src/data/articles.json')) as {
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
    expect(projectLayout).toContain('/articles/${entry.id}/');
    expect(projectLayout).toContain('seriesArticles');
    expect(articlePage).toContain('findArticleProject');
    expect(articlePage).toContain('getArticleProjectIssue');
    expect(articlePage).toContain('groupArticlesIntoSeries');
    expect(articlePage).toContain('getArticlePager');
    expect(articlePage).toContain('getSeriesAwareRelated');
    expect(projectPage).toContain('getArticlesForProject');
  });

  it('keeps the search result count in sync with the active type filter', () => {
    const search = read('src/components/SearchPanel.astro');
    expect(search).toContain('resultStatus(renderResults(data), query)');
    expect(search).toContain('resultStatus(renderResults(currentItems), input?.value.trim() ?? \'\')');
    expect(search).not.toContain("copy('msgResult').replace('{count}', String(matches.length))");
  });

  it('wires the new interaction batch end to end', () => {
    const baseLayout = read('src/layouts/BaseLayout.astro');
    const lightbox = read('src/components/Lightbox.astro');
    const palette = read('src/components/CommandPalette.astro');
    const reading = read('src/components/ReadingProgress.astro');
    const prose = read('src/components/ProseEnhancements.astro');
    const shortcuts = read('src/components/KeyboardShortcuts.astro');
    const search = read('src/components/SearchPanel.astro');
    const heatmap = read('src/components/WritingHeatmap.astro');

    // 灯箱与命令面板全局挂载
    expect(baseLayout).toContain('<Lightbox />');
    expect(baseLayout).toContain('<CommandPalette />');
    expect(lightbox).toContain('[data-lightbox]');
    expect(lightbox).toContain("querySelectorAll('img')");

    // 命令面板：构建期注入已发布条目 + Cmd/Ctrl+K 打开
    expect(palette).toContain('getCollection');
    expect(palette).toContain('isVisibleEntry');
    expect(palette).toContain("event.key.toLowerCase() === 'k'");

    // 阅读位置记忆与恢复
    expect(reading).toContain('site-reading-positions');
    expect(reading).toContain('smoothScroll.halt()');

    // 代码行号/折叠、搜索高亮、Web Share
    expect(prose).toContain('has-line-numbers');
    expect(prose).toContain('is-collapsed');
    expect(prose).toContain('mark.search-hit');
    expect(prose).toContain('navigator.share');
    expect(search).toContain("sessionStorage.setItem('search-highlight'");

    // g 前缀序列
    expect(shortcuts).toContain('pendingGoto');

    // 站点统计与年度对比
    expect(heatmap).toContain('writing-heatmap__stats');
    expect(heatmap).toContain('writing-heatmap__years');

    // prefetch 悬停预取
    const config = read('astro.config.mjs');
    expect(config).toContain("prefetch: { prefetchAll: true, defaultStrategy: 'hover' }");
  });

  it('maps j/k shortcuts to explicit previous and next links', () => {
    const shortcuts = read('src/components/KeyboardShortcuts.astro');
    expect(shortcuts).toContain(".article-nav a.next");
    expect(shortcuts).toContain(".article-nav a:not(.next)");
    expect(shortcuts).not.toContain('links[links.length - 1]');
    // 快捷键在任何模态（灯箱/命令面板/帮助面板）打开时必须让位
    expect(shortcuts).toContain("document.querySelector('dialog[open]')");
  });

  it('routes programmatic navigation through the client router with compositor-driven progress', () => {
    const shortcuts = read('src/components/KeyboardShortcuts.astro');
    const palette = read('src/components/CommandPalette.astro');
    const header = read('src/components/Header.astro');
    const reading = read('src/components/ReadingProgress.astro');
    const search = read('src/components/SearchPanel.astro');

    // 快捷键跳页 / 命令面板回车 / "/" 键兜底都必须走 ClientRouter：
    // 整页 location.href 会丢 View Transitions 过渡，也吃不到悬停预取
    expect(shortcuts).toContain("import { navigate } from 'astro:transitions/client'");
    expect(shortcuts).toContain('navigate(href)');
    expect(shortcuts).toContain('target.click()');
    expect(shortcuts).not.toContain('window.location.href = target.href');
    expect(palette).toContain("import { navigate } from 'astro:transitions/client'");
    expect(palette).toContain('navigate(item.href)');
    expect(header).toContain("navigate('/search/')");
    // 页脚「随便看看」与命令面板的搜索动作同样不能整页刷新
    const footer = read('src/components/Footer.astro');
    expect(footer).toContain("import { navigate } from 'astro:transitions/client'");
    expect(footer).not.toContain('window.location.href = candidates');
    expect(palette).toContain("navigate('/search/')");

    // 进度条用 scaleX 合成器动画，不再逐帧改 width 触发 layout
    expect(reading).toContain('scaleX(');
    expect(reading).toMatch(/transition:\s*transform/);
    expect(reading).not.toMatch(/transition:\s*width/);

    // 搜索页空闲预热 pagefind，首次搜索不等待索引下载
    expect(search).toContain('requestIdleCallback');
  });

  it('routes every scroll-driven consumer through the shared frame ticker', () => {
    const ticker = read('src/lib/scroll-ticker.ts');
    const reading = read('src/components/ReadingProgress.astro');
    const backToTop = read('src/components/BackToTop.astro');
    const toc = read('src/components/TableOfContents.astro');
    const header = read('src/components/Header.astro');
    const effects = read('src/lib/scroll-effects.ts');
    const stage = read('src/lib/stage-progress.ts');

    // 调度器必须提供读/写两阶段，且读阶段先于写阶段执行
    expect(ticker).toContain('read?: () => void');
    expect(ticker).toContain('write?: () => void');
    expect(ticker).toContain('onScrollFrame');

    // 各滚动消费者不再自带 scroll 监听与 rAF，全部走共享调度器
    for (const consumer of [reading, backToTop, toc, header]) {
      expect(consumer).toContain("from '../lib/scroll-ticker'");
    }
    // lib 内部的两个模块用相对同目录导入
    expect(effects).toContain("from './scroll-ticker'");
    expect(stage).toContain("from './scroll-ticker'");
    expect(reading).not.toContain("addEventListener('scroll', onScroll");
    expect(backToTop).not.toContain("addEventListener('scroll', onScroll");
    expect(toc).not.toContain("addEventListener('scroll', onScroll");
    expect(header).not.toContain("addEventListener('scroll', onScroll");
    expect(effects).not.toContain("addEventListener('scroll', onScroll");
    expect(stage).not.toContain("addEventListener('scroll', schedule");

    // 全站只剩必要的 scroll 监听：位置落盘 + 惯性同步 + 调度器本身
    expect(reading).toContain("addEventListener('scroll', saveOnIdle");
  });

  it('keeps modal focus and scroll locking intact', () => {
    const lightbox = read('src/components/Lightbox.astro');
    const palette = read('src/components/CommandPalette.astro');
    const prose = read('src/components/ProseEnhancements.astro');

    // 灯箱/截图弹窗打开时锁滚动，桌面端不能因滚动条消失而横向跳动
    expect(lightbox).toContain('scrollbar-gutter: stable');
    expect(lightbox).toContain('overflow: hidden');

    // 模态关闭后把焦点还给触发元素，键盘用户不会掉回 body
    expect(lightbox).toContain('lastTrigger');
    expect(lightbox).toContain("dialog.addEventListener('close'");
    expect(palette).toContain('lastTrigger');
    expect(palette).toContain("dialog.addEventListener('close'");

    // 搜索高亮跳转前先停惯性滚轮，否则会被衰减中的 instant 写入覆盖
    expect(prose).toMatch(/const jumpToHit = \(\) => \{[\s\S]*?smoothScroll\.halt\(\)/);
  });

  it('keeps search highlighting and floating bars from colliding or mis-marking', () => {
    const prose = read('src/components/ProseEnhancements.astro');
    const reading = read('src/components/ReadingProgress.astro');
    // /g 正则的 test() 前必须重置 lastIndex，否则高亮会漏标
    expect(prose).toContain('pattern.lastIndex = 0;');
    // 内嵌目录是标题的重复文本：不能被高亮，也不能进 Pagefind 索引
    expect(prose).toContain(".inline-toc'");
    // 内嵌目录锚点点击要先停惯性滚轮，与侧栏 TOC 行为一致
    expect(prose).toContain(".inline-toc a[href^=\"#\"]");
    expect(prose).toContain('smoothScroll.halt()');
    const layout = read('src/layouts/ArticleLayout.astro');
    expect(layout).toContain('<details class="inline-toc" data-pagefind-ignore>');
    // 搜索高亮条与阅读恢复条不能共用 bottom: 24px 居中位置
    expect(prose).toMatch(/\.search-hit-bar\s*\{[^}]*bottom:\s*84px/s);
    // 「从头开始」后不再回写阅读位置
    expect(reading).toContain('resumeDismissed');
    expect(reading).toContain('if (!resumeDismissed)');
  });

  it('ships the seo, offline and shared-element batch safely', () => {
    const articleLayout = read('src/layouts/ArticleLayout.astro');
    const card = read('src/components/ContentCard.astro');
    const sw = read('public/sw.js');
    const bookmarks = read('src/pages/bookmarks.astro');
    const rss = read('src/pages/rss.xml.ts');
    const prose = read('src/components/ProseEnhancements.astro');
    const baseLayout = read('src/layouts/BaseLayout.astro');
    const globalCss = read('src/styles/global.css');

    // 文章级 JSON-LD 带 wordCount；正文 meta 展示字数
    expect(articleLayout).toContain('wordCount');
    expect(articleLayout).toContain('estimateWordCount');

    // RSS 全文经 rendered.html 进 content:encoded
    expect(rss).toContain('rendered?.html');

    // 外链加固在客户端统一 target=_blank + rel
    expect(prose).toContain("anchor.target = '_blank'");
    expect(prose).toContain("rel.add('noopener')");

    // 卡片阅读进度与位置记忆同一数据源
    expect(card).toContain('data-card-progress');
    expect(card).toContain('site-reading-positions');

    // Service worker 缓存裁剪：上限 + 离线壳保护
    expect(sw).toContain('MAX_ENTRIES');
    expect(sw).toContain('pruneCache');

    // 收藏页空态按实际渲染数判定
    expect(bookmarks).toContain('empty.hidden = rendered > 0');

    // 命名过渡：列表卡片与详情标题同名（article-{id}）
    expect(articleLayout).toContain('transition:name={`article-${article.id}`}');
    expect(card).toContain("'transition:name': transitionName");

    // 夜间自动主题只在未手动选择时生效（首屏 + 运行中两处）
    expect(baseLayout).toContain('scheduledTheme');
    expect(read('src/components/ThemeToggle.astro')).toContain('manualChoiceStored');

    // 打印样式隐藏全部浮层装饰
    expect(globalCss).toContain('@media print');
    expect(globalCss).toContain('.back-to-top');
  });

  it('keeps every static project rail anchor clear of the sticky header', () => {
    const layout = read('src/layouts/ProjectLayout.astro');
    const panel = read('src/components/ProjectCapabilityPanel.astro');
    const expected = 'scroll-margin-top: calc(var(--header-height) + 32px)';
    const cssBlock = (source: string, selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return source.match(new RegExp(`${escaped} \\{[^}]*\\}`))?.[0] ?? '';
    };

    const anchors = [
      ['project-overview', '.project-hero'],
      ['product-panorama-title', '.project-panorama__heading h2'],
      ['project-notes', '.project-body-grid'],
      ['project-series', '.series-directory'],
    ] as const;

    for (const [id, selector] of anchors) {
      expect(layout, id).toContain(`id="${id}"`);
      expect(cssBlock(layout, selector), id).toContain(expected);
    }
    expect(cssBlock(panel, '.project-capabilities h2')).toContain(expected);
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
    expect(read('src/data/chrome.json')).toContain('登录 GitHub 后即可参与');
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
