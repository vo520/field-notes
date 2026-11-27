---
title: Trae CN 配置同步
description: 开发环境配置同步仓库，集中维护全局规则与记忆文件，换机时一条命令恢复工作环境。
publishedAt: 2026-11-18
status: active
category: 个人品牌
tech: [Git, Markdown, Shell]
modules:
  - name: 全局规则
    description: 用 Markdown 维护跨项目硬约束与协作规范。
    features:
      - user_rules 目录按主题拆分规则文件
      - 全局硬约束单独成文便于复核
      - 规则变更随仓库提交留痕
  - name: 记忆文件
    description: 按项目维度沉淀长期记忆与参考材料。
    features:
      - memory/user_profile.md 保存用户画像
      - memory/projects 下按项目分目录
      - 换机后保留原有检索路径
  - name: 同步边界
    description: 只同步可复用的文本配置，凭证与插件缓存不入仓库。
    features:
      - .gitignore 采用白名单模式
      - JWT、权限与插件缓存排除在外
      - 敏感文件与体积较大内容不入库
roles:
  - name: 配置维护者
    scope: 编写规则、整理记忆并提交同步
  - name: 新机器使用者
    scope: 克隆仓库后把规则与记忆合并回本地目录
workflow:
  - label: 规则修改
    status: 在 user_rules 中编辑 Markdown
  - label: 提交同步
    status: 通过 Git 提交并推送到私有仓库
  - label: 换机恢复
    status: 克隆后合并规则与记忆目录
  - label: 凭证处理
    status: SSH 密钥等敏感信息手动迁移
integrations: [Git, Markdown, .gitignore, Trae CN]
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
