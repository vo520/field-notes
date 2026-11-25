---
title: 越疆机器人资讯管理系统
description: 基于 Next.js 14 的资讯采集与任务管理后台，集中管理 RSS 采集、任务进度与数据看板。
publishedAt: 2026-04-10
featured: true
status: active
category: 内容创作
tech: [Next.js 14, React, TypeScript, SQLite]
cover: /images/projects/yuejiang-news-site.svg
sourceVisibility: private
---

## 项目背景

品牌与市场团队需要持续跟踪行业资讯，过去依赖人工收集与表格汇总，来源分散、进度不可见。这个系统把采集、整理和任务跟进收敛到一个后台。

## 技术方案

- Next.js 14（App Router）+ React 18 + TypeScript 搭建管理端，Tailwind CSS 负责布局与主题。
- 使用 better-sqlite3 落库，rss-parser 负责订阅源解析，采集任务与结果按来源、时间维度归档。
- 通过 recharts 呈现资讯量、来源分布与任务进度，形成可复核的数据看板。
- 页面按「采集源 / 任务 / 资讯库 / 看板」拆分，接口与数据访问集中在服务端路由。

## 交付与边界

源码托管在私有仓库，不对外提供访问。运行需要本地 SQLite 数据库与可访问的 RSS 源。
