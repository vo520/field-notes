---
title: AI 视频下载总结器
description: 开源 AI 视频下载与总结工具的公开 fork，Vue 3 + FastAPI + yt-dlp + DeepSeek 全栈实践。
publishedAt: 2026-11-25
status: active
category: 内容创作
tech: [Vue 3, FastAPI, Python]
cover: /images/projects/free-video-downloader.svg
sourceVisibility: public
repoUrl: https://github.com/vo520/free-video-downloader
---

## 项目背景

该项目支持从多平台解析并下载音视频，并对内容做 AI 总结与思维导图整理。本仓库为公开 fork，用于学习其前后端架构与流式交互实现。

## 技术方案

- 前端 Vue 3 负责解析地址、任务进度与结果展示，下载与总结通过接口触发。
- 后端 FastAPI 封装 yt-dlp 解析能力，配合 SSE 推送下载与总结进度。
- AI 总结接入 DeepSeek 等模型服务，输出摘要与结构化要点。
- 鉴权与额度通过 JWT 管理，支付能力对接 Stripe。

## 交付与边界

仓库为公开 fork，保留上游开源协议与版权声明。实际可用性依赖第三方平台规则与模型服务额度，仅用于技术学习与本地验证。
