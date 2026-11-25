---
title: NavMate 导航系统
description: NavMate 网址导航系统的公开 fork，Laravel 13 + Vue 3.5 前后端分离架构。
publishedAt: 2026-11-25
status: active
category: 生活服务
tech: [Laravel, Vue 3, PHP]
cover: /images/projects/navmate.svg
sourceVisibility: public
repoUrl: https://github.com/vo520/NavMate
---

## 项目背景

NavMate 是一个开源的网址导航与书签管理项目，后端 Laravel 13、前端 Vue 3.5 分离部署，支持多主题与用户体系。本仓库为公开 fork，用于本地部署与功能验证。

## 技术方案

- 后端基于 Laravel 13 提供分类、站点与用户相关接口，使用数据库迁移初始化结构。
- 前端 Vue 3.5 负责导航页、后台管理与主题切换，通过 API 与后端交互。
- 本地按前后端分离方式分别启动，验证书签导入、分类管理与权限流程。

## 交付与边界

仓库为公开 fork，保留上游开源协议与版权声明；部署所需的环境变量与数据库配置由使用者自行提供。
