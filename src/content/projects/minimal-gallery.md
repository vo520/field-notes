---
title: Nimmal 极简画廊
description: Next.js 摄影画廊模板的维护分支：JSON 内容配置、EdgeOne 一键部署，修复部署链路与 SEO 元数据。
publishedAt: 2026-09-01
status: completed
category: 内容创作
tech: [Next.js, TypeScript, Tailwind CSS, Docker, Nginx]
modules:
  - name: 画廊展示
    description: 面向摄影作品的极简展示模板。
    features:
      - 分类展示与相册管理
      - 响应式设计
      - 内容通过 JSON 配置（home.json 等）维护，不改代码即可换内容
  - name: SEO 元数据
    description: 让画廊页面在分享与搜索里可被正确理解。
    features:
      - OG / Twitter Card 元数据
      - JSON-LD 结构化数据
  - name: 部署形态
    description: 两种开箱即用的部署方式。
    features:
      - 腾讯云 EdgeOne Pages 一键部署按钮与模板
      - Dockerfile + nginx 自托管
      - 修复 nginx types 块导致全站 Content-Type 退化的 P0 回归
  - name: 逻辑加固
    description: 专项排查修复真实缺陷。
    features:
      - 代码逻辑排查修复多个真 bug
      - 稳健性加固
roles:
  - name: 作品展示者
    scope: 修改 JSON 配置维护画廊内容
  - name: 模板使用者
    scope: 一键部署或自托管使用模板
workflow:
  - label: 内容配置
    status: 编辑 JSON 配置替换默认内容
  - label: 本地验证
    status: 构建并检查页面与元数据
  - label: 部署
    status: EdgeOne 一键部署或 Docker 自托管
integrations: [Next.js, Tailwind CSS, EdgeOne Pages, Docker, Nginx]
cover: /images/projects/minimal-gallery.svg
demoUrl: https://minimal-gallery.edgeone.app/
screenshots:
  - src: /images/projects/minimal-gallery/home.jpg
    alt: 画廊模板首页
    title: 画廊首页
    caption: JSON 配置驱动的摄影画廊首页，精选合集与 Hero 文案。
    viewport: desktop
    width: 1440
    height: 900
sourceVisibility: private
---

## 项目背景

需要一个极简、内容可配置的摄影画廊模板：作品分类展示、相册独立管理，部署越简单越好。选用 Next.js 静态导出 + JSON 内容配置的形态，并补齐部署链路上的真实问题。

## 技术方案

- 站点内容（首页 hero、精选合集、服务与推荐语）全部收敛到 JSON 配置文件，使用者不改代码即可完成个性化。
- 部署提供两条路径：腾讯云 EdgeOne Pages 一键部署，以及 Dockerfile + nginx 自托管；专项修复 nginx types 块写法导致全站 Content-Type 退化的 P0 回归。
- 补齐 OG / Twitter Card 与 JSON-LD 结构化数据，保证分享卡片与搜索摘要正确。
- 对模板做整体逻辑排查，修复若干真实缺陷并加固稳健性。

## 交付与边界

模板代码托管在私有仓库维护，线上演示站公开可访问。仓库不含真实摄影作品授权之外的素材。
