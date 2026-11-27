---
title: 越疆小程序预约迭代
description: 越疆业务小程序的迭代分支，聚焦访客预约体验：车牌多格式支持、人脸绑定、预约签到修复与多端 token 同步。
publishedAt: 2026-11-24
status: active
category: 客户服务
tech: [uni-app, Vue, JavaScript, 微信小程序]
modules:
  - name: 访客预约优化
    description: 完善预约提交与到场签到链路。
    features:
      - 新增工作日历与时段配置
      - 预约状态同步优化
      - 修复预约签到链路问题
  - name: 车牌体系
    description: 支持多种车牌格式的输入与存储。
    features:
      - 新能源车牌与多格式兼容
      - 港澳车牌文案与类型切换逻辑修复
      - 车牌输入校验与列表存储格式修复
  - name: 魔点对接
    description: 与门禁开放平台对接的人脸与访客能力。
    features:
      - 人脸绑定链路修复
      - 访客名兼容英文名展示
      - 第三方访客服务配置化
  - name: 稳定性
    description: 排查与观测能力建设。
    features:
      - 新增调试日志工具
      - 修复 loading 锁死并添加友好错误提示
      - 多端 token 同步修复
roles:
  - name: 访客
    scope: 提交预约、完善人脸与车牌信息、到场签到
  - name: 受访人
    scope: 接收并确认预约
  - name: 维护者
    scope: 通过调试日志排查线上问题
workflow:
  - label: 预约提交
    status: 选择时段与受访人并提交预约
  - label: 信息完善
    status: 上传人脸与车牌信息
  - label: 到场签到
    status: 二维码签到进入园区
  - label: 异常排查
    status: 调试日志定位并修复
integrations: [uni-app, 微信小程序, 魔点开放平台]
cover: /images/projects/yj-uniapp-one.svg
sourceVisibility: private
---

## 项目背景

业务小程序上线后，访客预约模块在真实园区场景里暴露出一批体验问题：车牌格式五花八门、境外车牌文案不准确、人脸绑定失败、签到偶发异常。本仓库是针对这些问题的迭代分支，把预约链路打磨到可用。

## 技术方案

- 车牌模块重构为多格式兼容：普通、新能源、港澳牌统一校验与存储格式，文案与类型切换按真实场景修正。
- 预约模块补上工作日历与时段配置，状态同步避免提交后两端不一致。
- 魔点对接侧修复人脸绑定与访客名兼容（含英文名），第三方访客服务改为配置化接入。
- 稳定性专项：新增调试日志工具、修复 loading 锁死、多端 token 同步，保证排查线上问题有据可查。

## 交付与边界

源码托管在私有仓库，不对外提供访问。仓库不含门禁平台密钥与生产配置。
