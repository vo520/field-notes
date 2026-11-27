---
title: 机器人论坛小程序
description: 越疆机器人的业务小程序，覆盖微信登录、应用社区、访客预约、积分商城与魔点门禁直连等模块。
publishedAt: 2025-03-18
status: completed
category: 社区服务
tech: [uni-app, Vue, JavaScript, 微信小程序, Pinia]
modules:
  - name: 首页与社区
    description: 聚合新闻、轮播与推荐内容，并提供帖子发布、评论和点赞。
    features:
      - 首页轮播与新闻入口
      - 论坛发帖与评论
      - 点赞与内容互动
  - name: 登录与个人中心
    description: 以微信登录为主，绑定手机号后进入个人中心与积分体系。
    features:
      - 微信授权登录与手机号绑定
      - 个人资料与账号设置
      - 积分与任务入口
  - name: 访客预约与门禁
    description: 把访客预约、邀请码与魔点门禁能力接到同一条业务链路。
    features:
      - 访客预约表单与记录
      - 邀请码生成与校验
      - 魔点直连入口
  - name: 积分商城
    description: 围绕签到、任务和兑换形成用户激励闭环。
    features:
      - 每日签到与积分累计
      - 积分商城兑换
      - 任务与积分流水
roles:
  - name: 微信用户
    scope: 登录小程序、浏览社区、提交预约并参与积分活动
  - name: 运营人员
    scope: 维护新闻内容与社区互动数据
workflow:
  - label: 微信登录
    status: 授权登录并可绑定手机号
  - label: 内容浏览
    status: 首页与社区加载新闻、轮播和帖子
  - label: 预约提交
    status: 填写访客信息并生成访问凭证
  - label: 积分激励
    status: 签到与任务累计积分，用于商城兑换
integrations: [uni-app, Vue 2, Pinia, 微信小程序, uview-plus, uniCloud, 魔点门禁]
cover: /images/projects/robot-forum-miniapp.svg
sourceVisibility: private
---

## 项目背景

越疆机器人的业务小程序把首页信息聚合、微信登录、应用社区、访客预约、积分激励与魔点门禁放在同一个入口里，免安装、分享路径短，适合展会与展厅场景。

## 技术方案

- 采用 uni-app 组织页面，按首页、论坛、应用、访客预约与「我的」划分 tabBar 与业务页面。
- 微信授权登录为主，绑定手机号后使用积分、预约与商城等功能。
- 列表页做分页加载与下拉刷新，详情页支持图文内容与评论展示。
- 公共请求与登录态封装在工具层，页面只关心数据渲染。
- 访客预约通过邀请码与魔点直连接口衔接门禁流程。
- 适配不同机型的安全区与胶囊按钮位置。

## 交付与边界

源码托管在私有仓库，不对外提供访问。运行需要配置小程序 AppID 与对应的服务端接口。
