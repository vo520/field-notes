---
title: EyouCMS 安全审计
description: 对 EyouCMS（ThinkPHP5）做源码级安全审计，修复余额支付重复扣款、订单水平越权与并发超卖等资金链路缺陷。
publishedAt: 2026-11-02
status: active
category: 企业官网
tech: [EyouCMS, PHP, ThinkPHP 5, MySQL]
modules:
  - name: 资金链路修复
    description: 排查并修复余额支付环节的资金安全问题。
    features:
      - 修复余额支付重复扣款缺陷
      - 收敛支付与订单状态机的更新时序
      - 补充支付失败的回滚路径
  - name: 越权防护
    description: 封堵订单模块的水平越权访问。
    features:
      - 修复订单水平越权（篡改单号即可操作他人订单）
      - 订单读写统一校验归属人
  - name: 并发与库存
    description: 修复代码审计发现的并发类缺陷。
    features:
      - 修复活动兑换与库存扣减的超卖窗口
      - 关键写入补齐事务与唯一约束
  - name: 兼容性与全量排查
    description: 全项目逐目录排查前端与后端逻辑缺陷。
    features:
      - 修复 PHP8 兼容性缺陷
      - 逐目录输出审计结论并最小化修复
roles:
  - name: 安全审计员
    scope: 逐目录排查源码、复现缺陷并输出最小改动修复
  - name: 站点运营者
    scope: 使用修复后的系统建站与运营商城支付
workflow:
  - label: 建立审计基线
    status: fork 上游并梳理模块与资金链路
  - label: 逐目录排查
    status: 按模块输出问题清单与证据
  - label: 复现与修复
    status: 最小改动修复并补注释
  - label: 回归验证
    status: 本地 Docker 环境回归后提交
integrations: [EyouCMS, ThinkPHP 5, MySQL, Docker Compose]
cover: /images/projects/eyoucms.svg
sourceVisibility: public
repoUrl: https://gitee.com/vo520/eyoucms
---

## 项目背景

EyouCMS 是基于 ThinkPHP 5 的企业建站系统，商城模块涉及余额支付与订单资金链路。直接把开源系统上线存在真实资金风险，因此把它作为一次完整的安全审计对象：在本地 Docker 环境跑通全流程，再逐目录排查源码。

## 技术方案

- 从上游 fork 建立独立仓库，审计过程全部留痕为独立 commit，便于回看每类缺陷的修法。
- 资金链路重点排查支付回调与余额扣款：重复扣款通过状态机收敛修复，订单越权通过归属校验封堵。
- 并发类缺陷（超卖、重复兑换）以事务与唯一约束兜底，兼容性问题按 PHP8 语法差异逐项修正。
- 修复遵循最小改动原则，不做功能重构，保证与上游的 diff 可审。

## 交付与边界

审计仍在持续进行，已有修复以 commit 形式发布在公开仓库。仓库包含上游源码与自己的修复提交，不包含任何线上站点数据与真实交易记录。
