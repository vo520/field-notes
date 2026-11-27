---
title: Shopify 主题定制与维护
description: inffnitech 店铺的 Shopify 主题体系：Dawn 16 基线二开、Fleet 线上主题维护与 Fabric / Horizon 官方主题评估。
publishedAt: 2026-10-12
status: active
category: 电商平台
tech: [Liquid, Shopify CLI, Dawn, JSON Templates]
modules:
  - name: Dawn 基线二开
    description: 以 Dawn 16.0.0 为基线建立可版本控制的主题工程。
    features:
      - Dawn 16.0.0 初始化主题基线
      - .shopifyignore 目录规则修正，消除 CLI 警告
      - settings_data.json 移出版本控制（编辑器自动生成）
  - name: Fleet 线上主题维护
    description: 维护店铺线上 Fleet 主题与开发基线。
    features:
      - live 主题（Fleet-QS）与 dev 基线（Fleet-lmq）分离管理
      - header.liquid 翻译键修复（solid.solid → group.solid）
      - OS 2.0 JSON 模板编排
  - name: 官方主题评估
    description: 拉取官方新主题做本地对比评估。
    features:
      - Fabric、Horizon 主题 pull 到本地存档
      - 与现有 Fleet 主题做结构对照
  - name: 发布流程
    description: 多环境分级的安全发布链路。
    features:
      - shopify.theme.toml 配置 development / staging / production 环境
      - theme dev 本地预览 → theme check → push --unpublished → 人工验收 → 编辑器切 live
      - live 主题不从本地直推，避免误上线
roles:
  - name: 主题开发者
    scope: section / snippet / schema 的定制与检查
  - name: 店铺运营
    scope: 在主题编辑器中配置版位并切换上线
workflow:
  - label: 建立基线
    status: theme pull 拉取线上主题入版本控制
  - label: 本地改造
    status: theme dev 预览并修改 Liquid
  - label: 质量检查
    status: theme check 通过后推送 unpublished 主题
  - label: 验收上线
    status: 人工验收后在编辑器切换 live
integrations: [Shopify CLI 4.9, Liquid, Dawn 16, Fleet, Fabric, Horizon]
cover: /images/projects/shopify-themes.svg
demoUrl: https://www.inffnitech.com/
sourceVisibility: private
---

## 项目背景

店铺同时存在多个主题：线上 Fleet 主题承载真实流量，Dawn 基线用于二开沉淀，Fabric / Horizon 等官方新主题需要评估是否切换。核心诉求是把主题改动纳入版本控制，并且保证上线链路不误伤线上主题。

## 技术方案

- Dawn 16.0.0 作为二开基线，settings_data.json 等编辑器自动生成文件移出版本控制，减少无意义 diff。
- Fleet 主题按「live 只读、dev 可改」管理：线上 live 主题只 pull 不直推，改动一律先推 unpublished 主题人工验收。
- shopify.theme.toml 按 development / staging / production 分环境配置，production 留空强制走编辑器切换。
- 官方主题 pull 到本地做结构对照，评估迁移成本后再决定是否切换。

## 交付与边界

主题工程托管在私有仓库，不对外提供访问。线上店铺为真实经营环境，仓库不含店铺后台配置与凭据。
