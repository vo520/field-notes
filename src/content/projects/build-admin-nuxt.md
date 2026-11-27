---
title: 机器人产品展示站
description: 基于 BuildAdmin Nuxt 前端改造的四足机器人产品展示站，覆盖绝影 X30 与 X500 系列的产品列表、筛选与多语言详情页。
publishedAt: 2026-11-06
status: completed
category: 企业官网
tech: [Nuxt 3, Vue 3, TypeScript, Element Plus]
modules:
  - name: 产品列表与筛选
    description: 重构产品列表页，把产品数据收敛为独立数据源。
    features:
      - 筛选功能与列表重构
      - 产品数据收敛到独立数据文件（data/products.ts）
      - 产品导航数据独立维护（productNav.ts）
  - name: 系列产品详情页
    description: 为 X30 与 X500 系列搭建可复用的产品详情组件。
    features:
      - X30 与 X500 Pro Max 产品详情页
      - 产品配色切换、规格表、视频弹层
      - 抽屉二级菜单与搜索弹层
  - name: 多语言
    description: 中英文文案分离维护。
    features:
      - lang 目录 globs-en / globs-zh-cn 双语包
  - name: SPA 稳定性
    description: 修复单页路由往返后的运行时问题。
    features:
      - 修复 SPA 往返后运行时不初始化与旧实例残留
      - 修复抽屉二级菜单状态残留
      - 修复搜索弹层输入框无法聚焦
roles:
  - name: 访客
    scope: 浏览产品列表与系列详情
  - name: 内容维护者
    scope: 通过独立数据文件维护产品信息与文案
workflow:
  - label: 产品数据整理
    status: 机型、规格与配色收敛为数据文件
  - label: 组件复用
    status: 详情页按系列复用产品组件
  - label: 多语言适配
    status: 中英文案分离与切换
  - label: 全局排查
    status: 整合模块、清理死资源与未用依赖
integrations: [Nuxt 3, Vue 3, Element Plus, BuildAdmin]
cover: /images/projects/build-admin-nuxt.svg
sourceVisibility: public
repoUrl: https://gitee.com/vo520/build-admin-nuxt
---

## 项目背景

四足机器人产品线需要一个能承载多系列、多机型参数的产品展示站。选择 BuildAdmin 的 Nuxt 前端作为底座，把它的后台骨架改造成面向访客的产品站，重点解决机型多、参数表复杂、需要双语的问题。

## 技术方案

- 产品数据全部收敛到独立数据文件，列表页与详情页只读数据源，新增机型不改组件。
- 详情页按系列复用同一组产品组件：配色切换、规格表、视频弹层、系列导航都是通用组件。
- 多语言走 lang 目录双语包，页面文案与产品文案分离维护。
- 针对单页路由往返做专项修复：运行时初始化、旧实例残留、抽屉状态与弹层聚焦问题逐一收敛。

## 交付与边界

站点代码发布在公开仓库，包含产品站完整前端。仓库不含后台服务端配置与真实商业数据。
