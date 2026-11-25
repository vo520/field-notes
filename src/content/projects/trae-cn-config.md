---
title: Trae CN 配置同步
description: 开发环境配置同步仓库，集中维护全局规则与记忆文件，换机时一条命令恢复工作环境。
publishedAt: 2026-11-18
status: active
category: 个人品牌
tech: [Git, Markdown, Shell]
cover: /images/projects/trae-cn-config.svg
sourceVisibility: private
---

## 项目背景

多台机器上维护同一套开发规则很容易漂移：改了一台，另一台还是旧版本。这个仓库把 Trae CN 的全局规则与记忆文件纳入版本管理，让配置像代码一样同步。

## 技术方案

- 目录结构对齐 `~/.trae-cn`：`user_rules/` 存放规则正文，`memory/` 存放记忆文件。
- `.gitignore` 排除 JWT、密钥与插件等敏感或体积较大的内容，只同步可复用的文本配置。
- 新机器上先克隆仓库，再把 `user_rules/` 与 `memory/` 合并回本地目录，结构与源机器保持一致。
- SSH 公私钥不入库，换机时手动拷贝并修正权限。

## 交付与边界

源码托管在私有仓库，不对外提供访问。仓库只同步配置文本，不包含任何凭证。
