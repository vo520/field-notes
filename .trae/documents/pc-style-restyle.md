# 按 likeadmin pc 风格重构博客前端

## Context

用户要求把本博客（Astro 静态站）的前端风格与样式，按其 Gitee 仓库 `vo520/likeadmin_php_saas` 的 `pc` 站点视觉重构。

已通过稀疏克隆 `/tmp/likeadmin-pc/pc` 读取其源码与样式，提取出的视觉契约：

* 纯黑白灰：白底 `#fff`、区块灰 `#f1f2f4`、正文 `#282828`、次要 `#666`、弱化 `#999`、主色/链接/按钮 `#000`、页脚 `#c7c9d1`
* 细边替投影：`1px rgba(0,0,0,.08)` 分隔，几乎不用阴影与发光
* 胶囊描边按钮：`border-radius: 999px`、1px 半透明黑边，hover 反转为黑底白字，箭头随 hover 旋转 45°
* 排版：eyebrow 字重 300 + 大标题 700，标题字号远大于正文，留白充足
* 导航：悬浮圆角胶囊 + 半透明模糊底 + 细边，滚动后变实；hover 用 2px 黑色下划线
* 图片：卡片内图片 hover 缓慢放大 `scale(1.04)`，不加重阴影
* 容器宽 1280 / 内容区 960，区块之间用整块灰底切换

当前站点是相反方向：`observatory / nebula / terminal` 三套深色星空主题、canvas 星空、指针光晕、3D tilt 卡片、发光边框。因此这是一次“视觉体系替换”，不是调色。

用户已确认四项决策：

1. 浅色为主 + 深色可选（删除三套星空主题，保留 light/dark 两态，对应 pc 的暗色开关）
2. 首页头部使用悬浮玻璃胶囊导航
3. 全站统一重构（首页、项目、文章、标签、关于、留言板、搜索、404、页脚）
4. 字体使用系统字体栈（停止使用 `@fontsource-variable/inter`、`@fontsource-variable/noto-sans-sc`）

不改动：内容（`src/content/**`）、路由、Giscus 配置、`wrangler.jsonc` 部署配置、SEO 结构。

## 设计契约（写入 `src/styles/global.css`）

```css
:root {
  color-scheme: light;
  --content: 1280px; --content-narrow: 960px; --prose: 760px;
  --header-height: 64px;
  --canvas: #ffffff; --surface: #ffffff; --surface-soft: #f1f2f4;
  --ink: #282828; --ink-strong: #000000; --muted: #666666; --muted-weak: #999999;
  --border: rgba(0, 0, 0, 0.08); --border-strong: rgba(0, 0, 0, 0.3);
  --accent: #000000; --accent-ink: #ffffff; --accent-soft: rgba(0, 0, 0, 0.05);
  --focus-ring: #000000;
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-pill: 999px;
  --font-sans: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'HarmonyOS Sans SC',
    'Source Han Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
:root[data-theme='dark'] { /* 反相：--canvas:#141414; --surface:#1c1c1c; --surface-soft:#232323; --ink:#f2f2f2; --border:rgba(255,255,255,.12); --accent:#fff; --accent-ink:#000; */ }
```

通用类（在 global.css 中定义，供各组件复用，避免逐文件重复样式）：

* `.container` 1280 + 24px 边距；`.container--narrow` 960
* `.eyebrow`：12px / letter-spacing .22em / uppercase / 300 / `--muted`
* `.button` + `.button--primary`：pill 描边按钮，hover 反转；箭头 `.button__arrow` 45° 旋转
* `.section--soft`：`background: var(--surface-soft)`
* `.hairline`：1px 细边；`.chip`：pill 标签
* 焦点样式保留 `:focus-visible` 黑描边；保留 `.skip-link`

## 实施步骤

### 1. 主题机制切换

* `src/layouts/BaseLayout.astro`：删除 `@fontsource-*` 两个 import、`CosmicInteractions`、`CosmicBackdrop`；首屏内联脚本改为读写 `localStorage['site-theme']`，只接受 `light | dark`，默认 `light`；保留 `prefers-color-scheme` 仅在无存储值时用于首次判断（仍以浅色为默认）。
* `src/components/ThemeToggle.astro`：由三按钮组改为单个“浅色/深色”切换按钮（含 `aria-pressed`、图标与文字），派发事件改为 `site-theme-change`。
* 删除：`src/lib/cosmic-theme.ts`、`src/lib/starfield.ts`、`src/components/CosmicBackdrop.astro`、`src/components/CosmicInteractions.astro`。
* `src/lib/giscus.ts`：`GiscusTheme` 改为 `'light' | 'dark'`，`resolveGiscusTheme` 返回 light/dark；`GiscusComments.astro` 监听 `site-theme-change` 并同步 iframe 主题。

### 2. 头部与页脚

* `Header.astro`：`position: sticky; top: 12px` 的胶囊容器，`background: rgba(255,255,255,.72)` + `backdrop-filter: blur(18px)` + 1px 细边 + 圆角 8px；导航项 `opacity .7 → 1` 与 2px 黑色下划线；深色模式用对应半透明深色底。
* `MobileMenu.astro`：白底/深底抽屉，细边分隔，胶囊按钮。
* `Footer.astro`：`--surface-soft` 灰块（深色下 `#1c1c1c`），顶部 1px 细边，去掉 `backdrop-filter` 与阴影；底部一行版权保留。

### 3. 首页 `src/pages/index.astro`

* hero 改为整块 `--surface-soft` 灰底 + 超大标题（桌面 `clamp(3.5rem, 7vw, 6rem)`，移动端上限 44px 按现状保留）；
* eyebrow 改浅字重 300；主 CTA 用 pill 按钮；统计信息用细竖线分隔，去掉发光/轨道装饰；
* 项目区改为白底 + 2 列卡片网格，卡片 1px 细边、无阴影；
* 删除 `data-cosmic-*`、`data-reveal`、`data-cosmic-hero` 等标记与相关 CSS。

### 4. 卡片与列表组件

按新契约重写 scoped 样式（保留全部 DOM 语义、筛选逻辑、ARIA）：

* `ProjectCard.astro`：白卡 + 1px 细边 + 12px 圆角，去掉 tilt/highlight/glow；图片 hover `scale(1.04)`；元信息用 `.chip`；操作链接改文字链 + 箭头。
* `ContentCard.astro`、`ProjectGallery.astro`、`ProjectCategoryGrid.astro`、`SectionHeading.astro`、`TagList.astro`：细边、灰块、eyebrow/标题层级统一。
* `ProjectScreenshots.astro`：设备框由深色 10px 边框改为浅色卡片（`--surface-soft` 内衬 + 1px 细边 + 8px 圆角），保留缩略图横向滚动与 dialog 交互。
* `RepositoryConstellation.astro`、`ProjectCapabilityPanel.astro`：配色改为黑/灰/白，线条 `--border-strong`，节点用黑白点，去掉 glow。
* `SearchPanel.astro`：白面板 + 细边 + 胶囊输入框，结果 hover 用灰底。

### 5. 详情页与长文

* `ArticleLayout.astro`、`ProjectLayout.astro`：标题区放到灰块，正文 `--prose` 760，细边分隔，去掉发光标题与玻璃卡。
* `ArticleNav.astro`、`TableOfContents.astro`、`ProseEnhancements.astro`：引用块/代码块/表格改为 pc 式浅色（代码块深底保留可读性但去发光），目录用细边左栏。
* `GiscusComments.astro`：容器改白卡细边，说明文字用 `--muted`。

### 6. 其余页面

`projects/index.astro`、`articles/index.astro`、`articles/[id].astro`、`projects/[id].astro`、`tags/[tag].astro`、`about.astro`、`guestbook.astro`、`search.astro`、`404.astro`：统一页头结构（eyebrow + 大标题 + 描述）、灰/白区块交替、细边分隔；保留现有文案与数据逻辑。

### 7. 字体与依赖

* 删除 `package.json` 中 `@fontsource-variable/inter`、`@fontsource-variable/noto-sans-sc`，执行 `npm uninstall` 更新 lockfile；`--font-sans` 改系统栈，代码用 `--font-mono`。

### 8. 测试与文档同步

* 删除 `tests/cosmic-theme.test.ts`、`tests/starfield.test.ts`、`tests/cosmic-interactions.test.ts`。
* 重写 `tests/brand.test.ts` 的视觉契约部分：浅色 token、系统字体、无 `@fontsource`、glass header、细边卡片；允许 300 字重 eyebrow；保留身份与社交断言。
* 重写 `tests/layout-contract.test.ts` 为新设计契约（容器宽度、hero 灰块、移动端 44px 上限、胶囊按钮、卡片细边、截图浅色框、留言板分栏）。
* 更新 `tests/giscus.test.ts`（light/dark 映射）、`tests/build-smoke.test.ts`（主题按钮 3 → 1 个切换，删除三主题断言，补充浅色 token 断言）。
* README 中“三套星空主题”“Cloudflare Pages”等过时描述同步改为浅色/深色主题与 Workers。

## 关键文件

新增/改写：`src/styles/global.css`、`src/layouts/BaseLayout.astro`、`src/components/{Header,Footer,ThemeToggle,MobileMenu,ProjectCard,ContentCard,SectionHeading,TagList,SearchPanel,ProjectScreenshots,ProjectGallery,ProjectCategoryGrid,RepositoryConstellation,ProjectCapabilityPanel,GiscusComments,ArticleNav,TableOfContents,ProseEnhancements}.astro`、`src/layouts/{ArticleLayout,ProjectLayout}.astro`、`src/pages/**/*.astro`、`src/lib/giscus.ts`、`package.json`、`README.md`、`tests/*`。

删除：`src/lib/{cosmic-theme,starfield}.ts`、`src/components/{CosmicBackdrop,CosmicInteractions}.astro`、`tests/{cosmic-theme,starfield,cosmic-interactions}.test.ts`。

## 验证

1. `npm run check`（astro check）无类型/模板错误。
2. `npm test`：除已知依赖本机 `php` 的 `showcase-*` 外全部通过；主题/布局契约测试同步更新后通过。
3. `npm run build` 产出 `dist/` 31 个 HTML。
4. 本地 `npm run preview`，复用用户已开的 Chrome 验证：
   * 首页：灰块 hero、胶囊导航 hover 下划线、卡片细边与图片缩放；
   * 项目列表筛选、项目详情截图灯箱、文章目录与正文排版；
   * 浅色/深色切换刷新后保持，Giscus iframe 主题跟随；
   * 760px / 390px 宽度无横向滚动，标题不超过 44px；
   * 键盘 Tab 焦点可见，`prefers-reduced-motion` 下无多余动画。
5. 构建后清理 `/tmp/likeadmin-pc` 稀疏克隆。

## 不做

* 不引入 Element Plus / Nuxt / UnoCSS，不复制 pc 的业务组件与请求层；
* 不改内容、路由、Giscus 参数、部署配置；
* 不新增页面或功能。
