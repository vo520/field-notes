---
title: Omnivision 品牌官网前端
description: 品牌官网前端重构项目，使用 React + Vite + TypeScript 实现组件化页面与响应式布局。
publishedAt: 2026-08-25
status: active
category: 企业官网
tech: [React, TypeScript, Vite]
modules:
  - name: 页面区块组件
    description: 将品牌首页拆成可复用的导航、按钮、卡片与内容区块。
    features:
      - 公共按钮与卡片独立维护
      - 区块按页面组合拼装
      - 改版无需整页重写
  - name: 交互与表单
    description: 基于无障碍原语封装交互组件并接入表单校验。
    features:
      - Radix UI 提供无障碍基础
      - react-hook-form 负责表单状态与校验
      - 交互样式集中在主题层
  - name: 主题与响应式
    description: 设计变量统一管理，覆盖桌面、平板与移动端断点。
    features:
      - 颜色、间距与字号走设计变量
      - 多断点响应式布局
      - 静态资源随前端工程一起维护
roles:
  - name: 前端维护者
    scope: 维护组件、页面区块与工程配置
  - name: 代码评审者
    scope: 通过检查与测试守住改动质量
workflow:
  - label: 组件拆分
    status: 按页面区块沉淀通用组件
  - label: 页面拼装
    status: 用组件组合出完整页面
  - label: 质量校验
    status: TypeScript、ESLint 与 Vitest 逐项检查
  - label: 提交门禁
    status: husky 在提交前触发校验
integrations: [React, TypeScript, Vite, Radix UI, react-hook-form, ESLint, Vitest, husky]
cover: /images/projects/omnivision-brand.svg
demoUrl: https://www.omnivision-group.com/
screenshots:
  - src: /images/projects/omnivision-brand/home.jpg
    alt: 豪威集团官网首页
    title: 品牌官网首页
    caption: 集团官网首页，最新发布横幅与新闻轮播。
    viewport: desktop
    width: 1440
    height: 900
sourceVisibility: private
---

## 项目背景

Omnivision 品牌官网需要从静态页面升级为可维护的前端工程：页面由组件拼装，样式与交互统一管理，后续改版不必整页重写。

## 技术方案

- Vite 构建 + React + TypeScript，按页面区块拆分组件，公共按钮、卡片、导航独立维护。
- 基于 Radix UI 无障碍原语封装交互组件，表单校验使用 react-hook-form 体系。
- 设计变量集中在主题层，响应式断点覆盖桌面、平板与移动端。
- 工程内置 TypeScript 检查、ESLint、Vitest 与 husky 提交钩子，保证改动可验证。

## 交付与边界

源码托管在私有仓库，不对外提供访问。仓库包含前端工程与静态资源，不包含后端接口实现。
