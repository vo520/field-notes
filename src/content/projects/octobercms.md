---
title: October CMS 本地化部署
description: October CMS 4.4.11 的本地部署方案，用 Docker Compose 拉起 PHP 8.4 + Apache + MySQL 8.4。
publishedAt: 2026-11-02
status: completed
category: 企业官网
tech: [Docker Compose, PHP 8.4, MySQL 8.4]
modules:
  - name: 容器编排
    description: 用两个服务分别承载应用与数据库，本地一条命令启动。
    features:
      - Apache + PHP 8.4 应用容器
      - MySQL 8.4 数据容器与健康检查
      - 固定端口供浏览器直接访问
  - name: 环境隔离
    description: 把运行环境收进容器，避免污染本机 PHP 与数据库。
    features:
      - Dockerfile 安装 GD、pdo_mysql 等扩展
      - 重建容器即可回到干净状态
      - 环境变量集中管理连接信息
  - name: 内容持久化
    description: 挂载主题、插件与存储目录，容器重建后保留安装内容。
    features:
      - themes、plugins、storage 目录挂载到宿主机
      - 数据库卷独立保留
      - 首次启动后通过安装向导初始化
  - name: 主题与插件验证
    description: 用内置主题与 RainLab、Responsiv 插件验证建站能力。
    features:
      - 多套官方主题可直接切换
      - 插件目录随仓库保留
      - 可继续验证 Tailor 与静态页面能力
roles:
  - name: 本地开发者
    scope: 启动容器、验证安装向导并维护主题与插件
  - name: 站点管理员
    scope: 安装完成后在后台配置站点内容
workflow:
  - label: 构建镜像
    status: 按 Dockerfile 安装 PHP 扩展与 Apache 模块
  - label: 启动服务
    status: docker compose 拉起应用与数据库
  - label: 初始化站点
    status: 访问后台并完成安装向导
  - label: 验证能力
    status: 在本机检查主题与插件生态兼容性
integrations: [Docker Compose, Apache, PHP 8.4, MySQL 8.4, October CMS 4.4.11]
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
