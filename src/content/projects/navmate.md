---
title: NavMate 导航系统
description: NavMate 网址导航系统的公开 fork，Laravel 13 + Vue 3.5 前后端分离架构。
publishedAt: 2026-11-25
status: active
category: 生活服务
tech: [Laravel, Vue 3, PHP]
demoUrl: https://hao.wccto.com
modules:
  - name: 分类导航与搜索
    description: 前台按多级分类展示站点，并提供实时搜索与多引擎跳转。
    features:
      - 分类树与图标展示
      - 站内实时搜索
      - 百度、Bing、Google 等引擎跳转
  - name: 用户收藏与快捷链接
    description: 注册用户可以维护自己的收藏夹、常用链接与布局偏好。
    features:
      - 邮箱注册、登录与找回密码
      - 收藏和快捷链接增删改查
      - 亮色与暗色主题切换
  - name: 后台管理
    description: 后台集中维护分类、站点、用户、广告、友链与系统设置。
    features:
      - 站点 URL 自动抓取标题、描述与图标
      - HTML 与 JSON 书签导入
      - 点击趋势与热门站点统计
  - name: 安装与 SEO
    description: 提供 Web 安装向导并输出搜索引擎所需的基础文件。
    features:
      - 环境检测与数据库配置
      - sitemap.xml 与 robots.txt
      - 搜索引擎 Bot 预渲染
roles:
  - name: 访客
    scope: 浏览导航、搜索站点并跳转外部链接
  - name: 注册用户
    scope: 管理个人收藏、快捷链接与界面偏好
  - name: 管理员
    scope: 在后台维护分类、站点、用户和系统设置
workflow:
  - label: 安装向导
    status: 检测环境并写入数据库配置
  - label: 内容维护
    status: 管理员维护分类树与站点信息
  - label: 前台渲染
    status: API 返回分类与设置，前端生成导航页
  - label: 个性化
    status: 用户导入书签并调整布局与主题
integrations: [Laravel 13, Sanctum, Vue 3.5, Pinia, Tailwind CSS 4, MySQL, Redis, DOMPurify]
cover: /images/projects/navmate.svg
screenshots:
  - src: /images/projects/navmate/home-search.webp
    alt: NavMate 首页顶部搜索框、分类导航与常用推荐
    title: 首页搜索
    caption: 顶部搜索入口、分类导航与常用推荐书签。
    viewport: desktop
    width: 3651
    height: 1100
  - src: /images/projects/navmate/ai-tools.webp
    alt: NavMate 首页 AI 工具分类，聚合主流对话、写作与绘图工具
    title: AI 工具分类
    caption: 按对话、写作、绘图分组聚合主流 AI 工具，共五排卡片。
    viewport: desktop
    width: 1930
    height: 640
  - src: /images/projects/navmate/office-design.webp
    alt: NavMate 首页办公工具与设计创意分类
    title: 办公与设计工具
    caption: 办公工具按云存储、文档、邮箱分组，设计创意按素材与配色组织。
    viewport: desktop
    width: 1930
    height: 630
  - src: /images/projects/navmate/dev-media.webp
    alt: NavMate 首页开发编程与影音娱乐分类
    title: 开发与影音娱乐
    caption: 开发编程覆盖代码托管与包管理，影音娱乐覆盖主流视频平台。
    viewport: desktop
    width: 1930
    height: 600
sourceVisibility: public
repoUrl: https://github.com/vo520/NavMate
---

## 项目背景

NavMate 是一个开源的网址导航与书签管理项目，后端 Laravel 13、前端 Vue 3.5 分离部署，支持多主题与用户体系。本仓库为公开 fork，用于本地部署与功能验证。

## 技术方案

- 后端基于 Laravel 13 提供分类、站点与用户相关接口，使用数据库迁移初始化结构。
- 前端 Vue 3.5 负责导航页、后台管理与主题切换，通过 API 与后端交互。
- 本地按前后端分离方式分别启动，验证书签导入、分类管理与权限流程。

## 交付与边界

仓库为公开 fork，保留上游开源协议与版权声明；部署所需的环境变量与数据库配置由使用者自行提供。
