---
title: GEOFlow 部署实践
description: GEOFlow 开源 GEO 内容工程平台的公开 fork，用于本地部署与二次开发验证。
publishedAt: 2026-11-25
status: active
category: 内容创作
tech: [PHP 8.4, Laravel 12, PostgreSQL, Redis, Vue 3, Vite]
modules:
  - name: 知识与内容生产
    description: 集中管理素材、文章、提示词与模型配置，支撑内容生成。
    features:
      - 支持 TXT、Markdown、DOCX、PDF、PPTX 导入
      - 提示词与模型参数可在后台配置
      - 素材库供多站点内容复用
  - name: AI 质检与任务
    description: 对文章做证据、引文与规则检查，并跟踪生成和分发进度。
    features:
      - 记录评分、原文定位与修改建议
      - 支持按分数放行与人工审核
      - 任务列表展示执行状态
  - name: 多站点分发
    description: 管理站点配置、专题与发布渠道，把内容分发到多个出口。
    features:
      - 托管站点与模板包管理
      - 平台渠道转为人工工单
      - 输出 robots、sitemap 与 llms.txt
  - name: 本地部署验证
    description: 在容器内完成依赖安装、数据库初始化与后台入口验证。
    features:
      - 按 PHP 技术栈梳理运行环境
      - 验证多站点配置与后台界面
      - 记录宿主环境差异供二次开发
roles:
  - name: 内容运营
    scope: 维护知识库、文章、素材与质检结果
  - name: 站点管理员
    scope: 配置站点、模型、分发渠道与运行环境
workflow:
  - label: 环境准备
    status: 安装 PHP 依赖并初始化数据库
  - label: 内容配置
    status: 导入素材、设置模型与提示词
  - label: 生成与质检
    status: 创建任务并按评分决定放行或人工审核
  - label: 多站分发
    status: 向托管站点与渠道输出内容
integrations: [Laravel 12, PostgreSQL, pgvector, Redis, Vue 3, Vite, Docker Compose, Chrome 运营助手, WordPress REST API]
cover: /images/projects/geoflow.svg
screenshots:
  - src: /images/projects/geoflow/article-management.webp
    alt: GEOFlow 后台文章管理列表，展示文章状态与操作入口
    title: 文章管理
    caption: 后台文章列表，集中处理文章状态、分发进度与编辑入口。
    viewport: desktop
    width: 2000
    height: 1400
  - src: /images/projects/geoflow/materials.webp
    alt: GEOFlow 后台素材库页面，展示素材卡片与分类信息
    title: 素材库
    caption: 素材集中管理，供内容生产与多站分发复用。
    viewport: desktop
    width: 1600
    height: 1815
  - src: /images/projects/geoflow/task-management.webp
    alt: GEOFlow 后台任务管理页面，展示任务列表与执行状态
    title: 任务管理
    caption: 内容生产任务列表，跟踪生成与分发任务的执行状态。
    viewport: desktop
    width: 1600
    height: 1711
  - src: /images/projects/geoflow/ai-config.webp
    alt: GEOFlow 后台 AI 配置页面，展示模型与生成参数设置
    title: AI 配置
    caption: 配置模型与生成参数，驱动内容生产流程。
    viewport: desktop
    width: 1600
    height: 1230
  - src: /images/projects/geoflow/tasks-en.webp
    alt: GEOFlow 英文界面下的任务列表页面
    title: 英文任务界面
    caption: 后台支持英文界面，便于海外站点协作与多语言内容管理。
    viewport: desktop
    width: 1600
    height: 1726
sourceVisibility: public
repoUrl: https://github.com/vo520/GEOFlow
---

## 项目背景

GEOFlow 是一个面向 GEO（生成式引擎优化）的开源内容工程与多站分发平台，覆盖内容生产、质量检测与站点分发。本仓库是公开 fork，用于本地部署与二次开发验证，原始项目版权归原作者所有。

## 技术方案

- 按原项目技术栈搭建本地环境：PHP 8.4 + Laravel 12 应用，PostgreSQL（pgvector）与 Redis 服务，Vue 3 + Vite 构建前端。
- 在本地验证多站点配置、内容分发流程与后台管理界面的可用性。
- 记录部署过程中与宿主环境相关的配置差异，作为后续二次开发的基础。

## 交付与边界

仓库为公开 fork，保留上游开源协议与版权声明；二次开发内容以实际提交记录为准，不包含商业授权。
