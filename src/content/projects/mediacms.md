---
title: MediaCMS 部署与 LMS 集成
description: MediaCMS 视频平台 fork 的本地化实践：Docker 部署、中文界面、arm64 HLS 修复，以及面向 Moodle 5 的 LTI 双插件套件。
publishedAt: 2026-11-12
status: completed
category: 教育培训
tech: [MediaCMS, Python, Django, Docker, Moodle]
modules:
  - name: 本地化部署
    description: 让 MediaCMS 在本地容器环境稳定可用。
    features:
      - web 端口调整到 8082，避开本地 8080 冲突
      - arm64 环境从源码编译 bento4，修复 HLS 转封装不可用
      - 上游 9.2.x 版本基线
  - name: 中文化
    description: 站点与管理界面的中文翻译。
    features:
      - 站点与管理界面新增中文翻译
      - 修正 i18n 测试流程中身份提供方选择器干扰
  - name: 平台加固
    description: 对上游平台做安全与稳健性修复。
    features:
      - 路由、权限与上传校验加固
  - name: Moodle LTI 插件套件
    description: 面向 Moodle 的 MediaCMS 集成插件，含 filter 与 TinyMCE 编辑器双插件。
    features:
      - filter_mediacms：LTI 1.3 认证、MediaCMS URL 自动转嵌入播放器、双插件共享核心设置
      - tiny_mediacms：TinyMCE 编辑器按钮、LTI Deep Linking 浏览视频库、嵌入尺寸与起始时间配置
      - 声明硬依赖与构建脚本，产出独立安装包，Moodle 5 实测
roles:
  - name: 自建站管理员
    scope: 部署 MediaCMS、配置 LTI 凭据与插件
  - name: 教师与学员
    scope: 在 Moodle 课程中通过编辑器插入并观看视频
workflow:
  - label: 部署平台
    status: Docker 起服务并完成中文化与加固
  - label: 配置 LTI
    status: 在 MediaCMS 与 Moodle 侧配置 LTI 1.3 凭据
  - label: 安装插件
    status: 先装 filter 再装 tiny（硬依赖顺序）
  - label: 课程嵌入
    status: 编辑器内浏览视频库并插入播放器
integrations: [Docker, Django, Celery, bento4/ffmpeg, Moodle 5, LTI 1.3]
cover: /images/projects/mediacms.svg
sourceVisibility: public
repoUrl: https://github.com/vo520/mediacms
---

## 项目背景

需要一套可自托管的视频平台接入教学场景：视频由 MediaCMS 统一管理，课程页面在 Moodle 里通过 LTI 免登录嵌入播放。上游 MediaCMS 在 arm64 容器与中文环境下都有坑，先修平台再谈集成。

## 技术方案

- 部署层面：Docker 环境下调整 web 端口，arm64 机器上 HLS 依赖的 bento4 从源码编译，转封装链路才真正可用。
- 平台层面：新增站点与管理界面中文翻译，并顺手加固路由、权限与上传校验。
- 集成层面：实现 filter_mediacms 与 tiny_mediacms 两个 Moodle 插件，filter 负责 LTI 1.3 认证与 URL 自动嵌入并提供共享核心设置，tiny 在编辑器里通过 LTI Deep Linking 浏览视频库并按需配置嵌入参数；tiny 声明对 filter 的硬依赖，保证两者总是成套安装。

## 交付与边界

平台修复与插件源码发布在公开仓库，插件含构建脚本与安装说明。部署配置不含任何凭据与线上地址。
