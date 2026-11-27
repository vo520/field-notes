---
title: LikeAdmin 工单系统优化
description: 对 likeadmin 全栈管理系统做 92 轮代码评审与持续修复，并以 feat/ticket-optimize 分支完成工单模块优化。
publishedAt: 2026-11-20
status: active
category: 客户服务
tech: [Vue 3, Element Plus, Nuxt 3, ThinkPHP 8, uni-app, MySQL]
modules:
  - name: 工单模块优化
    description: 在独立分支集中优化工单链路的数据一致性与权限。
    features:
      - 升级 SQL 幂等性，避免重复执行产生脏数据
      - 修复 role_id=1 授权父链闭合问题
      - 工单相关接口与页面按同一分支交付
  - name: 多端一致性
    description: 管理端、PC 端与移动端按同一轮评审口径修复。
    features:
      - admin（Vue 3 + Element Plus）类型修复与统一错误处理
      - pc 端（Nuxt 3）类型修复与请求层统一
      - uniapp 端类型修复与工具函数收敛
  - name: 后台体验与权限
    description: 改善后台操作体验并补齐权限细节。
    features:
      - 优化左侧导航交互体验
      - 权限指令与菜单权限补齐
      - ORM 优化与 think-multi-app 升级修复 url() 500
  - name: 上传与运维
    description: 调整资源上传限制并完善失败反馈。
    features:
      - 图片视频上传限制调整
      - 上传失败提示完善
roles:
  - name: 全栈维护者
    scope: 按 review 轮次逐项修复并维护评审文档
  - name: 后台运营
    scope: 使用管理端处理工单与内容
  - name: 移动端用户
    scope: 通过 uniapp 端访问系统功能
workflow:
  - label: 评审立项
    status: 建立多轮评审清单与 qa 记录
  - label: 分端修复
    status: admin / pc / uniapp / server 按轮次修复
  - label: 工单专项
    status: feat/ticket-optimize 分支优化 SQL 与授权链
  - label: 回归提交
    status: 每轮修复独立提交并更新评审文档
integrations: [Vue 3, Element Plus, Nuxt 3, ThinkPHP 8, uni-app, MySQL]
cover: /images/projects/likeadmin.svg
sourceVisibility: public
repoUrl: https://gitee.com/vo520/likeadmin_php
---

## 项目背景

likeadmin 是一套覆盖管理端、PC 端与移动端的全栈管理系统。要在真实业务里长期使用，需要先解决历史遗留的逻辑缺陷：数据库设计、权限边界与多端类型问题累积较多，直接二次开发会在看不见的地方出问题。

## 技术方案

- 以「轮次」组织评审：每轮覆盖后端 ORM 与权限、admin 类型与错误处理、pc 与 uniapp 的请求层统一，修复内容在 REVIEW 与 qa 文档中留痕。
- 工单模块单开 `feat/ticket-optimize` 分支，集中处理 SQL 幂等与授权父链闭合，避免与日常评审修复互相干扰。
- 服务端基于 ThinkPHP 8，升级 think-multi-app 修复框架层 url() 调用导致的 500，不绕过框架自己打补丁。
- 所有修复保持最小改动，能收敛到公共请求层与工具函数的逻辑不再散落在页面里。

## 交付与边界

评审已进行 90 余轮，代码全部以独立 commit 发布在公开仓库。仓库不包含任何生产环境数据与真实账号。
