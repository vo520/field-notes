---
title: DOBOT 官网中文版
description: 越疆机器人中文官网的模板化实现，覆盖产品、方案、服务与新闻栏目，与英文站共用一套内容结构。
publishedAt: 2023-08-04
status: completed
category: 企业官网
tech: [HTML, CSS, JavaScript, PHP]
cover: /images/projects/dobotcn.svg
demoUrl: https://www.dobot.cn/
sourceVisibility: private
---

## 项目背景

越疆机器人面向国内客户的品牌官网，需要在同一套信息架构下承载产品介绍、行业方案、服务支持与企业新闻，并保持长期可维护的栏目结构。

## 技术方案

- 采用 PHP 模板 + HTML/CSS/JavaScript 的页面组织方式，公共头尾、导航与页脚抽成可复用片段。
- 产品页、方案页与新闻列表复用统一的栅格与卡片规范，新增栏目时只需补充模板与内容。
- 静态资源本地化，配合响应式断点适配桌面与移动端浏览。

## 交付与边界

源码托管在私有仓库，不对外提供访问。当前仓库保留的是站点前端模板与静态资源，完整运行需要对应的内容管理后台。
