---
title: MY-DOBOT 用户中心
description: DOBOT 官网用户中心前端，基于 Nuxt 2 承载账号资料与产品入口，为注册用户提供统一的服务入口。
publishedAt: 2026-11-18
featured: true
status: active
category: 客户服务
tech: [Nuxt 2, Vue, Vuex]
cover: /images/projects/mydobot-ui.svg
sourceVisibility: private
---

## 项目背景

DOBOT（越疆机器人）官网的注册用户需要在站内维护账号资料、查看产品相关信息。用户中心此前长期部署在内网 GitLab，本仓库是从内网备份恢复出的前端源码，用于本地维护与后续改造。

## 技术方案

- 以 Nuxt 2 组织页面路由与数据请求，服务端渲染保证首屏与 SEO 表现。
- 账号状态通过 Vuex 统一管理，登录态与接口请求在路由层做统一拦截。
- 页面按「账号资料 / 产品入口 / 服务支持」拆分，公共头尾与官网主站保持一致的视觉语言。

## 交付与边界

源码托管在私有仓库，不对外提供访问；页面依赖官网服务端接口与登录态，单独运行只能还原静态结构。
