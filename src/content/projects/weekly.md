---
title: 销售部周报系统
description: 销售部周报与订单快照系统：周报版本化、年度目标、历史周锁定，React + Cloudflare D1 构建，并完成 Node.js + SQLite 部署适配。
publishedAt: 2026-11-04
status: completed
category: 销售管理
tech: [React, Cloudflare Workers, D1, Drizzle ORM, Node.js 22, SQLite]
modules:
  - name: 周报填报
    description: 按周组织周报内容并支持版本演进。
    features:
      - 周报含周次、负责人、版本与更新时间
      - 浏览器自由选择的横竖向打印样式
  - name: 订单快照
    description: 每周留存订单数据快照。
    features:
      - 每周订单快照与稳定行 ID
      - 保留历史业务板块与负责人
  - name: 目标与锁定
    description: 目标管理与历史数据保护。
    features:
      - 年度目标及版本管理
      - 管理员历史周解锁状态（week_locks）
  - name: 账号体系
    description: 稳定的账号与凭证管理。
    features:
      - 稳定账号标识、角色与启用状态
      - 密码哈希 + salt 存储与凭证版本
  - name: 部署适配
    description: 从 Cloudflare 环境迁移到可自托管环境。
    features:
      - Cloudflare Workers / D1 → Node.js 22 + node:sqlite 适配
      - db:init 与 db:import 迁移脚本（禁止 --force 覆盖已有库）
      - SHA256 文件校验与部署交接说明
roles:
  - name: 销售人员
    scope: 填报周报与订单快照
  - name: 管理员
    scope: 解锁历史周、管理账号与目标
workflow:
  - label: 登录
    status: 账号密码登录并建立会话
  - label: 填报
    status: 录入周报内容与订单快照
  - label: 版本留存
    status: 提交后按周次与版本保存
  - label: 迁移部署
    status: D1 导出 → db:import 导入新库 → Node 启动
integrations: [React, Vinext, Cloudflare Workers, D1, Drizzle ORM, Node.js 22, SQLite]
cover: /images/projects/weekly.svg
sourceVisibility: private
---

## 项目背景

销售部需要一个不依赖 VPN、数据可长期留存的周报系统：周报按周版本化，订单每周做快照，年度目标单独管理，历史周不允许被随手改动。系统先在 Cloudflare Workers + D1 上跑通，再为国内环境做自托管部署适配。

## 技术方案

- 数据模型按「周」为核心组织：reports（周报）、orders（订单快照，稳定行 ID 保证历史可对账）、annual_targets（年度目标版本）、week_locks（历史周解锁）。
- 账号表保存稳定标识与凭证版本，密码只存哈希 + salt，不要求恢复明文。
- 部署适配层把 D1 依赖替换为 Node.js 22 原生 node:sqlite，提供 db:init 空库初始化与 db:import 正式数据导入两个脚本，导入脚本明确禁止覆盖已有数据库。
- 交接包包含 SQL 结构、SHA256 校验清单与部署说明，敏感数据与凭证不随包分发。

## 交付与边界

源码托管在私有仓库，不对外提供访问。仓库不含线上数据库备份、真实账号与运行密钥。
