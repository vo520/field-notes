---
title: 越疆机器人资讯管理系统
description: 基于 Next.js 14 的资讯采集与任务管理后台，集中管理 RSS 采集、任务进度与数据看板。
publishedAt: 2026-04-10
featured: true
status: active
category: 内容创作
tech: [Next.js 14, React, TypeScript, SQLite]
modules:
  - name: 采集源管理
    description: 集中维护 RSS 订阅源与来源维度，支撑持续跟踪行业资讯。
    features:
      - 订阅源条目维护
      - RSS 解析结果按来源与时间归档
      - 采集任务按来源分组
  - name: 任务管理
    description: 跟进采集任务的执行进度，让资讯整理过程可见。
    features:
      - 任务列表与状态跟踪
      - 采集结果与任务关联
      - 接口与数据访问集中在服务端路由
  - name: 资讯库
    description: 把采集结果整理成可复核的资讯条目库。
    features:
      - 按来源与时间维度归档
      - 数据落库后供看板统计
      - 页面按资讯库维度拆分
  - name: 数据看板
    description: 用图表呈现资讯量、来源分布与任务进度。
    features:
      - recharts 绘制统计图表
      - 资讯量与来源分布汇总
      - 任务进度可视化
roles:
  - name: 品牌市场运营
    scope: 配置采集源、跟进任务并复核资讯库
  - name: 系统维护者
    scope: 维护数据库、接口与本地运行环境
workflow:
  - label: 配置订阅源
    status: 在后台维护 RSS 来源
  - label: 执行采集
    status: rss-parser 解析订阅源并写入 SQLite
  - label: 整理归档
    status: 按来源与时间维度归档资讯
  - label: 看板复核
    status: 图表汇总资讯量与任务进度
integrations: [Next.js 14, React 18, TypeScript, Tailwind CSS, better-sqlite3, rss-parser, recharts]
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
