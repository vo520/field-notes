---
title: October CMS 本地化部署
description: October CMS 4.4.11 的本地部署方案，用 Docker Compose 拉起 PHP 8.4 + Apache + MySQL 8.4。
publishedAt: 2026-11-02
status: completed
category: 企业官网
tech: [Docker Compose, PHP 8.4, MySQL 8.4]
cover: /images/projects/octobercms.svg
sourceVisibility: private
---

## 项目背景

需要在本地快速验证 October CMS 的建站能力与插件生态。直接用本机 PHP 环境容易污染系统，因此把整套运行环境收进容器，做到用完即删。

## 技术方案

- 使用 Docker Compose 编排 Web 与数据库两个服务：Apache + PHP 8.4 承载应用，MySQL 8.4 提供数据存储。
- 通过挂载目录保留 October 的 themes、plugins 与 storage，容器重建后内容不丢失。
- 环境变量集中管理数据库连接与应用密钥，首次启动后执行安装向导完成初始化。
- 暴露固定端口，方便宿主机浏览器直接访问后台。

## 交付与边界

源码托管在私有仓库，不对外提供访问。该仓库只包含部署编排与环境说明，不包含 October CMS 本体代码。
