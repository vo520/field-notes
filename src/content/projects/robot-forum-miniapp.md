---
title: 机器人论坛小程序
description: 机器人主题业务小程序，覆盖首页聚合、手机号登录、应用社区与访客预约等真实业务模块。
publishedAt: 2025-03-18
status: completed
category: 社区服务
tech: [uni-app, Vue, JavaScript, 微信小程序]
cover: /images/projects/robot-forum-miniapp.svg
sourceVisibility: private
---

## 项目背景

越疆机器人的业务小程序把首页信息聚合、用户登录、应用社区与访客预约放在同一个入口里，免安装、分享路径短，适合展会与展厅场景。

## 技术方案

- 采用 uni-app 组织页面，按「首页 / 机器人应用 / 访客预约 / 我的」划分 tabBar 与业务页面。
- 列表页做分页加载与下拉刷新，详情页支持图文内容与评论展示。
- 公共请求与登录态封装在工具层，页面只关心数据渲染。
- 适配不同机型的安全区与胶囊按钮位置。

## 交付与边界

源码托管在私有仓库，不对外提供访问。运行需要配置小程序 AppID 与对应的服务端接口。
