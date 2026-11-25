---
title: 宗师部品门店价格表
description: 面向门店的产品报价页，单文件 HTML 实现搜索、分类筛选与打印友好的价格表。
publishedAt: 2026-08-20
status: completed
category: 销售管理
tech: [HTML, CSS, JavaScript]
cover: /images/projects/zongshibupin-index.svg
sourceVisibility: private
---

## 项目背景

门店需要一份随时可查、可直接打印的产品价格表。相比维护 Excel，单文件网页更容易分发和更新，也能在手机与门店电脑上直接打开。

## 技术方案

- 单个 HTML 文件内联样式与脚本，不依赖构建工具和外部 CDN，双击即可使用。
- 内置关键词搜索、分类切换与价格区间展示，输入即时过滤。
- 针对打印场景单独设置样式：隐藏操作区、压缩间距、保留表头与分页。
- 移动端采用卡片式布局，桌面端保留完整表格密度。

## 交付与边界

源码托管在私有仓库，不对外提供访问。价格数据随版本内置于文件中，更新价格时替换数据段即可。
