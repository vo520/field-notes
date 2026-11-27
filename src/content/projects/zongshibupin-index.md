---
title: 宗师部品门店价格表
description: 面向门店的产品报价页，单文件 HTML 实现搜索、分类筛选与打印友好的价格表。
publishedAt: 2026-08-20
status: completed
category: 销售管理
tech: [HTML, CSS, JavaScript]
modules:
  - name: 公开信息整理
    description: 把调研文档与数据表里的产品信息整理成可发布的数据段。
    features:
      - 调研文档与汇总表格作为输入
      - 产品信息按类别归纳
      - 数据表随仓库留存便于复核
  - name: 报价查询页
    description: 单文件页面提供关键词搜索与分类切换，输入即时过滤。
    features:
      - 关键词即时筛选
      - 分类切换与价格展示
      - 不依赖构建工具或外部 CDN
  - name: 打印与移动适配
    description: 同一份数据兼顾门店电脑打印与手机浏览。
    features:
      - 打印样式隐藏操作区并保留表头
      - 移动端采用卡片式布局
      - 桌面端保留表格密度
roles:
  - name: 门店销售
    scope: 查询产品价格并在需要时打印报价页
  - name: 资料维护者
    scope: 整理调研文档与数据表并更新价格数据段
workflow:
  - label: 资料调研
    status: 汇总公开信息文档与数据表
  - label: 数据整理
    status: 按类别归纳为页面内置数据
  - label: 页面使用
    status: 门店搜索、筛选并查看报价
  - label: 版本更新
    status: 价格变化时替换数据段并重新分发
integrations: [原生 HTML, CSS, JavaScript, Excel, Word]
cover: /images/projects/zongshibupin-index.svg
sourceVisibility: private
---

## 项目背景

门店需要一份随时可查、可直接打印的产品价格表。相比维护 Excel，单文件网页更容易分发和更新，也能在手机与门店电脑上直接打开。

## 技术方案

- 本地仓库保留公开信息调研文档与汇总数据表，作为报价页的数据来源。
- 单个 HTML 文件内联样式与脚本，不依赖构建工具和外部 CDN，双击即可使用。
- 内置关键词搜索、分类切换与价格区间展示，输入即时过滤。
- 针对打印场景单独设置样式：隐藏操作区、压缩间距、保留表头与分页。
- 移动端采用卡片式布局，桌面端保留完整表格密度。

## 交付与边界

源码托管在私有仓库，不对外提供访问。价格数据随版本内置于文件中，更新价格时替换数据段即可。
