---
title: 把静态博客当工程项目：Astro + Pagefind + Cloudflare Workers 上线自查
description: 从部署一致性、搜索索引、SEO、输入法交互到内容校验，记录这次系统自查的流程与真实踩坑。
publishedAt: 2026-11-25
tags: [Astro, Pagefind, Cloudflare, 工程实践]
featured: false
draft: false
---

静态博客看起来只是一堆 Markdown 加一个构建命令，真正上线后才会暴露问题：某个链接在本地能开、线上 404；搜索里搜不到首页；中文输入到一半页面跳走了。这次把整站当成一个工程项目重新过了一遍，下面是可复用的检查清单和几个真实的坑。

## 部署链路：先让三处配置说同一件事

静态站最常见的故障不是代码写错，而是「构建产物、托管配置、页面里的链接」三套规则不一致。这次统一了三处：

- Astro 配置 `trailingSlash: 'always'`，所有内部链接都以 `/` 结尾；
- Cloudflare Workers 静态资源 `html_handling: "force-trailing-slash"`，访问不带斜杠的地址会重定向；
- `not_found_handling: "404-page"`，找不到的路径交给构建出来的 `404.html`，而不是托管平台上默认的裸 404。

同时把站点域名收敛到一个来源：

```ts
// astro.config.mjs
site: process.env.SITE_URL ?? 'https://blog.ytn520.top'
```

`site` 只在构建期使用，运行时不需要任何环境变量。这样 canonical、Open Graph、RSS 和 sitemap 里的绝对地址都来自同一处，不会出现 RSS 里还写着旧域名的情况。

`robots.txt` 也不手写固定字符串，而是用 `Astro.site` 拼出 sitemap 地址。域名换一次，所有对外地址跟着换，少一个漏改的地方。

## 搜索索引：Pagefind 的规则比想象中严格

Pagefind 有个容易忽略的规则：**只要有一个页面标了 `data-pagefind-body`，没有这个属性的页面就不会被索引**。也就是说，不能只给文章页加标记，然后指望首页、项目页自动进入搜索。

反过来，一个页面可以出现多个 `data-pagefind-body`，Pagefind 会把它们的内容合并成一条索引记录。这给「只索引页面的有效部分」留了空间。

这次首页的处理是：

- 品牌文案区和开源说明区加 `data-pagefind-body`，让搜索能命中首页的核心介绍；
- 项目卡片区和文章卡片区加 `data-pagefind-ignore`，避免首页把十几张卡片的标题、描述全部收进索引，和详情页产生大量重复；
- `/search/` 页面本身不索引，`404` 由 Pagefind 自动排除。

最终索引页数不靠人工维护固定值，而是写进构建冒烟测试，按实际带 `data-pagefind-body` 的页面数比对：

```ts
const pagefindEntry = readFileSync('dist/pagefind/pagefind-entry.json', 'utf8');
const indexedPages = listHtmlFiles('dist').filter(
  (file) => readFileSync(file, 'utf8').includes('data-pagefind-body'),
).length;
expect(pagefindEntry).toContain(`"page_count":${indexedPages}`);
```

索引数量是最容易被忽略、又最容易在改动后悄悄漂移的指标。把它写成断言，新增或排除页面时会立刻暴露出来。

## SEO：排除和 noindex 要成对出现

把搜索页从 sitemap 里过滤掉，只完成了一半。sitemap 是给爬虫的「请收录」清单，页面自己的 `noindex` 才是「别收录」的明确指令。两个都做，才不会出现「sitemap 里没有、但被外链带进索引」的情况。

其余项目按页面类型补齐：

- 每页有唯一的 `title`、`description` 和 canonical；
- 文章页输出 `BlogPosting`，项目页输出 `SoftwareSourceCode`，首页输出 `WebSite` + `Person`；
- 项目详情页补 `og:image`，指向真实存在的封面文件；
- RSS 的 `lastBuildDate` 取内容里的最大更新时间，而不是构建时刻，避免每次构建都说「刚刚更新」。

JSON-LD 在构建后要能解析。冒烟测试里直接检查产物中是否包含 `"@type":"BlogPosting"` 这类字符串，成本低，但能拦住模板改坏导致的整段丢失。

## 两个真实的前端 bug

### backdrop-filter 会让 fixed 失去参照

移动端菜单原本是 `position: fixed`，在桌面浏览器里没问题，上了手机却跑到页面中间。原因是头部的 `backdrop-filter` 会创建包含块，里面的 `fixed` 元素改为相对这个头部定位，而不是相对视口。

修法不是加 `z-index`，而是把菜单改成 `position: absolute`，老老实实相对头部展开。凡是祖先元素用了 `filter`、`backdrop-filter`、`transform`、`perspective`，都要重新检查其内部 `fixed` 元素的参照物。

### 中文输入法会劫持快捷键

站点支持按 `/` 聚焦搜索，搜索结果支持 Enter 打开、上下键切换。这些监听在中文输入时全部会误触发：拼音还没上屏，`/` 就把页面带走了。

修复只需要在每个键盘处理函数开头加一个守卫：

```ts
if (event.isComposing) return;
```

`Header` 的全局快捷键和 `SearchPanel` 的输入框、结果列表都要加。只加在输入框上不够，因为组词期间的按键事件同样会冒泡到 document。

顺带修了移动端菜单：点击页面其他位置应当关闭，但点击头部自身的按钮不能关闭。判断方式是看点击目标是否落在 `.site-header` 内：

```ts
document.addEventListener('click', (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest('.site-header')) return;
  closeMenu();
});
```

## 内容模型：让错误在构建期失败

项目内容用 Zod 校验，字段名和取值都在 `src/lib/project-schema.ts` 里约束。这次实际拦住过几类问题：

- 技术栈字段叫 `tech`，不是 `tags`。写错字段不会静默通过，而是直接构建失败；
- 链接只接受 `http` / `https`，仓库地址额外限制为 GitHub 或 Gitee 的 HTTPS 地址；
- 标签转 slug 时保留中文，同时清理 `\ / ? # % & +` 等会破坏路径的字符。

内容校验的价值和接口契约一样：把「字段写错」从线上显示异常，提前成构建阶段的一条报错。文章集合的 `tags` 默认空数组、`draft` 默认 `false`，也意味着忘记写这两个字段不会导致内容消失或误发布。

## 验证流程：四层检查加一次只读审计

日常改动后的固定动作是 `npm run verify`，它串起四层：

1. `vitest`：内容模型、slug 生成、排序、可见性等单元测试；
2. `astro check`：类型与模板检查，目标是 0 error、0 warning、0 hint；
3. `astro build`：真实构建；
4. 构建冒烟测试：直接读 `dist`，断言页面数量、文章与标签页、RSS、sitemap、Pagefind 计数、robots 和 404。

冒烟测试读的是产物而不是源码，这一点很关键。模板里的条件分支、集合过滤、静态路径生成，只有构建后才知道最终有没有输出。

构建之后再做一次只读审计，覆盖那些不适合写成断言的项：

- 全部页面的内部链接和图片引用是否有缺失；
- 每页是否恰好一个 `h1`；
- `lang`、viewport、canonical、JSON-LD 是否齐全且可解析；
- RSS 与 sitemap 是否为合法 XML；
- CSS 中引用的变量是否都有定义。

这次审计的结果是 32 个页面、0 个死链、0 个缺图，每页一个 `h1`，27 个 CSS 变量全部有定义。唯一没有引用的组件是一个旧分类网格，因为测试还在约束它的实现，选择保留而不是删除。

## 取舍：不是所有「优化」都值得做

几处看起来可以改、最后决定不动的地方：

- **首页是否进索引**：全量索引会和详情页重复，完全不索引又搜不到站点介绍，最终只索引品牌文案区；
- **SVG 占位封面是否懒加载**：文件很小，又在首屏之下，保持 `loading="lazy"` 即可，不必为它增加额外的加载逻辑；
- **无人引用的组件**：先确认测试是否依赖，再决定删不删，避免为了「干净」破坏已有约束。

## 小结

静态博客的工程质量，主要体现在那些不会立刻报错的地方：域名是否只有一个来源、索引边界是否明确、SEO 的排除和 noindex 是否成对、输入法状态下快捷键是否还安全。把这些做成配置约束和构建断言，比每次上线前手动点一遍可靠得多。
