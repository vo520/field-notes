---
title: AI 视频下载总结器
description: 开源 AI 视频下载与总结工具的公开 fork，Vue 3 + FastAPI + yt-dlp + OpenAI 兼容模型接口全栈实践。
publishedAt: 2026-11-25
status: active
category: 内容创作
tech: [Vue 3, FastAPI, Python, yt-dlp, MiniMax API]
modules:
  - name: 视频解析与下载
    description: 粘贴链接后由后端解析多平台视频并提供清晰度与格式选择。
    features:
      - yt-dlp 覆盖主流音视频站点
      - FFmpeg 完成音视频合流
      - 针对特殊平台编写适配解析
  - name: AI 总结与问答
    description: 基于字幕与文本生成流式摘要、思维导图和上下文问答。
    features:
      - SSE 实时推送生成结果
      - 通过 OpenAI 兼容接口调用 MiniMax-M3
      - 交互式思维导图可缩放与导出
      - 问答紧扣当前视频字幕上下文
  - name: 字幕导出
    description: 将视频字幕整理为常见字幕文件格式供二次使用。
    features:
      - 支持 SRT、VTT 与 TXT
      - 与解析任务共用同一份字幕数据
  - name: 账号与权益
    description: 用邮箱注册登录与 JWT 鉴权区分免费用户和会员额度。
    features:
      - 无状态身份校验
      - 免费额度与会员权益区分
      - 海外支付通过 Stripe 完成
roles:
  - name: 游客
    scope: 浏览项目说明并在本地环境体验解析流程
  - name: 注册用户
    scope: 使用登录态提交解析、总结与问答任务
  - name: 会员
    scope: 使用 Stripe 支付后解锁更高额度
workflow:
  - label: 提交链接
    status: 前端收集视频地址与格式选项
  - label: 解析下载
    status: 后端调用 yt-dlp 与 FFmpeg 产出媒体文件
  - label: AI 处理
    status: MiniMax-M3 经 SSE 输出摘要并生成思维导图
  - label: 结果消费
    status: 用户查看总结、追问或导出字幕
integrations: [Vue 3, Tailwind CSS, FastAPI, yt-dlp, FFmpeg, OpenAI SDK, MiniMax-M3, JWT, Stripe]
cover: /images/projects/free-video-downloader.svg
sourceVisibility: public
repoUrl: https://github.com/vo520/free-video-downloader
---

## 项目背景

该项目支持从多平台解析并下载音视频，并对内容做 AI 总结与思维导图整理。本仓库为公开 fork，用于学习其前后端架构与流式交互实现。

## 技术方案

- 前端 Vue 3 负责解析地址、任务进度与结果展示，下载与总结通过接口触发。
- 后端 FastAPI 封装 yt-dlp 解析能力，配合 SSE 推送下载与总结进度。
- 上游 README 以 DeepSeek 为例；本地 fork 的总结器通过 OpenAI 兼容接口调用 MiniMax-M3，并配置独立的 API Key。
- 鉴权与额度通过 JWT 管理，支付能力对接 Stripe。

## 交付与边界

仓库为公开 fork，保留上游开源协议与版权声明。实际可用性依赖第三方平台规则与模型服务额度，仅用于技术学习与本地验证。
