# Nice 个人博客

一个以项目作品、技术文章和站内交流为核心的个人博客。网站按类别聚合 Gitee 与 GitHub 上的真实项目，用于展示 Nice 的全栈交付能力；内容静态生成，评论通过 Giscus 嵌入站内并由 GitHub Discussions 保存。

在线访问：[blog.ytn520.top](https://blog.ytn520.top)

## 功能

- Gitee / GitHub 项目聚合展示（数量随 `src/content/projects/` 中的公开条目自动统计），区分公开源码与私有项目，公开仓库可直达源码入口
- 文章列表、文章详情、标签聚合和阅读目录
- Pagefind 中文静态搜索
- GitHub 登录后的站内文章评论、项目评论、回复和固定全局留言板
- RSS、站点地图、SEO 元信息和 404 页面
- 浅色为主、深色可选的极简黑白视觉体系，支持主题记忆、响应式导航、键盘操作和减少动效
- Cloudflare Workers 静态资源托管，无需维护应用服务器
- Markdown/MDX 内容模型与构建期字段校验

## 部署与数据

| 服务 | 用途 |
|---|---|
| GitHub 仓库 | 代码、文章和项目版本管理 |
| Cloudflare Workers | 静态资源托管、HTTPS 和 `blog.ytn520.top` 自定义域 |
| GitHub Discussions / Giscus | 登录、评论、回复和全局留言 |
| Pagefind | 构建阶段生成中文全文搜索索引 |

网站由 Cloudflare 分发静态页面，GitHub 保存讨论数据；自定义域名、托管套餐和 GitHub 配置按实际账号与平台策略执行。

## 本地运行

需要 Node.js 22.18 或更高版本（构建脚本使用 Node 内置 TypeScript 类型剥离）。

```bash
npm install
npm run dev
```

生产构建和完整检查：

```bash
npm test
npm run check
npm run build
npm run preview
```

`npm run build` 会先生成 Astro 静态页面，再由 Pagefind 在 `dist/pagefind` 中生成中文搜索索引。

`npm test` 只覆盖博客站本身；`showcase/` 下的 PHP / Electron 项目测试依赖本机 `php`，用 `npm run test:showcase` 单独执行，`npm run test:all` 会跑两组。

也可以从干净目录一次执行全部单元测试、类型检查、生产构建和构建产物烟测：

```bash
npm run verify
```

## 站点身份

姓名、定位、简介、导航和社交链接统一维护在 `src/config/site.ts`。公开部署前需要同步设置 `SITE_URL`，并更新 `public/robots.txt` 中的站点地图地址。

当前公开定位为“全栈工程师”：强调企业官网、管理系统与小程序从需求梳理、前后端开发到部署迭代的完整交付过程。

## 发布文章

在 `src/content/articles/` 新建 Markdown 或 MDX：

```md
---
title: 文章标题
description: 一句话摘要
publishedAt: 2026-07-13
updatedAt: 2026-07-14
tags: [Astro, 工程实践]
featured: false
draft: false
---

这里开始写正文。
```

字段不符合 `src/content.config.ts` 时构建会直接失败并指出问题。

## 发布项目

在 `src/content/projects/` 新建 Markdown 或 MDX：

```md
---
title: 项目名称
description: 项目解决什么问题
publishedAt: 2026-07-13
status: active
category: 个人品牌
tech: [Astro, TypeScript]
cover: /images/projects/project-name.svg
sourceVisibility: public
repoUrl: https://github.com/vo520/project
featured: true
draft: false
---

## 项目目标

这里开始写项目详情。
```

`status` 只能是 `active`、`completed` 或 `archived`；`category` 必须从 `src/lib/projects.ts` 的 25 个固定分类中选择。

公开项目必须提供 `public/images/projects/` 下的站内封面。公开源码项目通过 `sourceVisibility: public` 配合 `repoUrl`（GitHub 或 Gitee）；私有项目使用 `sourceVisibility: private`，不得填写 `repoUrl`，页面会显示“私有项目 · 源码未公开”。`screenshots` 为可选项，一旦提供必须是 4–6 张真实运行界面。

项目发布遵守以下约束：

- 单仓项目使用 `repoUrl` 记录唯一代码仓库入口；多仓项目使用 `repositories` 列出用户前台、运营后台和服务端，并保留 `repoUrl` 作为首要仓库入口；
- 每个仓库 URL 必须指向实际公开位置，源码入口包含 README 和足以理解、运行核心功能的源码；配置方式写入文档，真实环境文件和凭据不入库；
- 发布前检查密钥、客户信息、内部地址、业务数据、构建产物和提交历史；子目录快照按文件白名单更新；
- 未完成源码整理或安全检查时保留 `draft: true`，不在作品库公开。

> `draft: true` 只会阻止生产页面生成。公开 GitHub 仓库仍然可以看到已经提交的草稿文件；真正的私密草稿不要提交到仓库。

## 内容后台（/admin/）

站点内置 [Sveltia CMS](https://github.com/sveltia/sveltia-cms) 后台，入口为 `https://blog.ytn520.top/admin/`，用于不写本地 Markdown 也能新增、修改文章和项目：

- 后台入口是 `src/pages/admin/index.astro`（`noindex`），通过 unpkg 加载固定版本 `@sveltia/cms`；
- `public/admin/config.yml` 定义 GitHub backend（`vo520/field-notes`、`main` 分支）、站点信息、文章与项目三个集合以及全部字段；
- 「站点信息」集合直接编辑 `src/data/site.json`（站点名称、标题、标题分隔符、RSS 标题模板、描述、品牌、作者、社交链接、顶部导航，以及首页、关于、页脚、404、搜索、项目、文章、标签、分类、留言板、OG 图等分组文案），构建期由 `src/lib/site-schema.ts` 校验；RSS 与 OG 图生成脚本读取同一份 JSON，改文案无需动代码；
- 保存即直接提交到 `main`，随后由 `Deploy` workflow 重新构建并发布，线上通常需要等一次 Actions 跑完；
- 上传图片写入 `public/images/uploads/`，引用路径为 `/images/uploads/...`。

留言与评论保存在 GitHub Discussions（仓库 `vo520/field-notes` 的分类 `General`）。`/admin/review/` 是只读的审核入口，按文章、项目和留言板列出对应讨论的定位链接；隐藏、删除、锁定都在 GitHub 上完成，该页同样 `noindex` 且不进入 sitemap。

图片统一规则（`tests/images.test.ts` 会校验）：文件放 `public/images/` 下，文件名用小写英文、数字和连字符（如 `home-desktop.png`）；格式限 `svg`/`png`/`jpg`/`webp`/`avif`；单张不超过 512 KB；内容里引用的封面与截图必须真实存在，截图的 `width`/`height` 必须等于图片实际像素；`public/images/uploads/` 下不允许有已无内容引用的孤儿图片。删除或替换图片时，记得同步清理引用。

后台依赖 GitHub OAuth 代理 `https://cms-auth.ytn520.top`（`base_url`），源码在 `workers/cms-auth/`（Sveltia 官方 `sveltia-cms-auth`，部署为 Cloudflare Worker 并绑定该自定义域），改动后运行 `npx wrangler deploy --config workers/cms-auth/wrangler.jsonc` 重新发布。`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` 以 Worker secrets 形式保存，不写入仓库；登录页报 OAuth 错误时先检查代理是否可用，而不是站点构建。

访问控制依赖 GitHub 权限：只有对 `vo520/field-notes` 有写权限的账号才能保存内容。`/admin/` 不会进入 sitemap，并同时通过页面 `noindex`、`_headers` 的 `X-Robots-Tag` 和 `robots.txt` 的 `Disallow: /admin/` 阻止收录，但知道地址的人仍可打开登录页。

字段规则以 `src/content.config.ts` 和 `src/lib/project-schema.ts` 为准：后台把未填写的可选项写成空数组或空字符串时按「未提供」处理；公开项目必须有站内封面和源码地址，私有项目不能填源码地址，截图一旦填写必须是 4–6 张。项目分类的下拉选项同时写在 `public/admin/config.yml` 与 `src/lib/projects.ts`，新增分类时两处都要改。新建文章时在右侧「别名」面板点铅笔可把文件名改成英文 slug。

## 源码展柜

`showcase/` 保留的是已隐藏工具项目的脱敏源码快照，用于维护历史实现与安全检查，不会出现在网站项目列表，也不作为当前公开网站产品的源码入口。

快照保留可审阅的核心实现和运行说明，不包含安装包、运行时数据库或本地凭据，也不复制依赖目录、Git 元数据和公司业务数据。更新快照时继续使用文件白名单，并在提交前复查目录映射与敏感信息。

根目录的 MIT License 覆盖仓库内源码，包括 `showcase/` 中的源码快照；文章和项目介绍等内容的版权仍由内容作者保留。

## 配置评论和全局留言

评论使用 Giscus。访客可以直接在博客页面内阅读讨论，发布或回复前必须登录 GitHub；文章和项目按路径映射，留言板固定映射到 `global-guestbook`。

仓库必须保持 Discussions 开启并安装 Giscus GitHub App。当前项目已经配置好以下公开参数，通常无需修改：

```dotenv
PUBLIC_GISCUS_REPO=vo520/field-notes
PUBLIC_GISCUS_REPO_ID=R_kgDOV69v5A
PUBLIC_GISCUS_CATEGORY=General
PUBLIC_GISCUS_CATEGORY_ID=DIC_kwDOV69v5M4DL6XY
```

这些值是 GitHub 公开标识，不是 OAuth 密钥。需要切换仓库或 Discussion 分类时，可以用同名 `PUBLIC_GISCUS_*` 环境变量覆盖项目默认值。

## 部署到 Cloudflare

站点通过 Cloudflare Workers 静态资源托管，生产域名为 `https://blog.ytn520.top`（自定义域由 `wrangler.jsonc` 的 `routes` 绑定，DNS 与证书由 Cloudflare 托管）。

```bash
npm run deploy
```

该命令先执行 `npm run build`（Astro 构建 + Pagefind 索引），再用 `wrangler deploy` 上传 `dist/`。首次在新机器部署前需要 `npx wrangler login`。

`astro.config.mjs` 的 `site` 默认值已是 `https://blog.ytn520.top`，需要临时构建到其它域名时用 `SITE_URL` 覆盖。

部署成功后检查浅色/深色主题切换、Giscus iframe、GitHub 登录入口以及留言和回复流程。

## 备份与迁移

- 文章、项目、样式和配置都在 Git 仓库中，Clone 仓库就是完整备份。
- 评论和留言保存在 GitHub Discussions，可通过仓库数据导出策略备份。
- `dist/` 是标准静态内容；迁移到其他静态托管平台时，只要允许加载 Giscus 即可继续使用评论。
- 如果不配置独立域名，迁移托管平台时 `workers.dev` 二级域名会改变。

## 目录

```text
src/config/site.ts          站点身份
src/content.config.ts       内容字段规则
src/content/articles/       文章
src/content/projects/       项目
src/components/             UI 与交互组件
src/layouts/                页面布局
src/pages/                  路由
src/components/GiscusComments.astro  GitHub 登录评论组件
public/admin/               Sveltia CMS 字段配置（后台入口页面在 src/pages/admin/）
workers/cms-auth/           GitHub OAuth 代理 Worker
wrangler.jsonc              Cloudflare Workers 静态资源部署配置
tests/                      自动测试
```

## 许可证

代码使用 MIT License。文章和项目内容的版权由内容作者保留。
