---
title: MY-DOBOT 用户中心
description: DOBOT 用户与设备管理后台，基于 Nuxt 2 + Element UI 承载用户、机器、工单、订单和培训申请等运营流程。
publishedAt: 2026-11-18
featured: true
status: active
category: 客户服务
tech: [Nuxt 2, Vue, Vuex, Element UI]
modules:
  - name: 用户与权限
    description: 管理账号列表、头像、角色与用户切换，支撑后台多角色协作。
    features:
      - 用户列表与详情维护
      - 头像与账号信息更新
      - 用户切换与角色区分
  - name: 机器管理
    description: 登记和编辑设备资料，按机器维度查看相关业务数据。
    features:
      - 机器列表与表单
      - 设备资料编辑
      - 机器维度数据查询
  - name: 工单与订单
    description: 按阶段展示工单与订单流程，便于运营跟踪处理进度。
    features:
      - 工单列表与阶段组件
      - 订单列表与分步视图
      - 处理状态集中呈现
  - name: 培训申请
    description: 集中管理培训申请与相关附件，配合文件上传完成资料提交。
    features:
      - 培训申请列表
      - 附件上传与更新
      - 与用户和设备资料关联
roles:
  - name: 运营人员
    scope: 在后台维护用户、机器、工单与订单
  - name: 培训管理员
    scope: 查看培训申请并处理附件资料
  - name: 前端维护者
    scope: 维护从内网恢复的 Nuxt 2 工程
workflow:
  - label: 登录进入
    status: 通过登录页与路由中间件校验访问身份
  - label: 资料维护
    status: 在用户与机器模块录入或更新资料
  - label: 业务跟进
    status: 按工单、订单和培训申请推进处理
  - label: 附件归档
    status: 通过上传组件补齐图像与文件资料
integrations: [Nuxt 2, Vue 2, Vuex, Element UI, Axios, 内网 GitLab, 官网服务端接口]
cover: /images/projects/mydobot-ui.svg
sourceVisibility: private
---

## 项目背景

DOBOT（越疆机器人）的运营侧需要一个统一管理用户、设备、工单和培训申请的前端后台。这套 Nuxt 2 工程长期部署在内网 GitLab，本仓库是从备份恢复出的源码，用于本地维护与后续改造。

## 技术方案

- 页面按「用户 / 机器 / 工单 / 订单 / 培训申请」拆分，公共头尾与布局由 Nuxt 2 统一管理。
- Element UI 提供表格、表单、弹窗与上传组件，Vuex 保存账号与页面状态。
- Axios 封装在请求插件中，路由中间件负责登录态校验与跳转。
- 中文站之外还保留英文站目录，便于对照两套界面结构。

## 交付与边界

源码托管在私有仓库，不对外提供访问；页面依赖官网服务端接口与登录态，单独运行只能还原静态结构。
