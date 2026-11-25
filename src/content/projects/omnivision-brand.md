---
title: Omnivision 品牌官网前端
description: 品牌官网前端重构项目，使用 React + Vite + TypeScript 实现组件化页面与响应式布局。
publishedAt: 2026-08-25
status: active
category: 企业官网
tech: [React, TypeScript, Vite]
cover: /images/projects/omnivision-brand.svg
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
