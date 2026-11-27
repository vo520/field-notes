---
title: DMXAPI 令牌管理系统
description: 大模型 API 令牌的自助查询与额度管理系统：proxy/db 双模式、查询缓存、防爆破告警、审计日志与部署运维套件。
publishedAt: 2026-11-19
status: active
category: 财务管理
tech: [Nuxt 4, Nitro, SQLite, Docker, Nginx]
modules:
  - name: 令牌查询
    description: 面向使用者的令牌用量自助查询。
    features:
      - 落地页 slug 直达令牌查询页与总览页
      - 90 秒查询缓存应对上游按 IP 限频
      - 总览页 60 秒 batch 刷新、并发限制与请求去重
  - name: 管理端
    description: 令牌发放、额度申请与审核。
    features:
      - 令牌发放 / 编辑 / 删除（事务清理用量与配额）
      - 额度申请金额封顶、pending 防重复提交
      - webhook 通知贯穿发放与审核
  - name: 安全防护
    description: 面向公网的多层防护。
    features:
      - IP 限流 10 次/分钟，失败累计触发「疑似令牌爆破扫描」webhook 告警
      - HMAC cookie + scrypt 会话、密码指纹校验、2FA
      - 登录按账号维度限流，封堵伪造 XFF 绕过
      - next 回跳白名单校验，封堵反斜杠跳站变体
  - name: 审计与运维
    description: 记录可查、部署可复现。
    features:
      - query_logs / audit_logs 按日期、关键词、状态过滤与 CSV 导出
      - 租户隔离与跨浏览器共享的服务端加密令牌簿
      - deploy.sh / rollback.sh 一键部署回滚，Docker 容器 + 独立数据卷
  - name: 双运行模式
    description: 同一套代码两种数据来源。
    features:
      - proxy 模式透传上游接口查询真实令牌
      - db 模式走本地 SQLite（sql.js WASM 垫片）闭环管理端发放的令牌
roles:
  - name: 令牌使用者
    scope: 查询令牌用量、提交额度申请
  - name: 管理员
    scope: 发放令牌、审核申请、查阅审计记录
  - name: 运维
    scope: 部署、告警响应与回滚
workflow:
  - label: 申请令牌
    status: 提交申请进入 pending
  - label: 审核发放
    status: 管理员审核并 webhook 通知
  - label: 用量查询
    status: 查询页经缓存查询上游并落库
  - label: 额度申请
    status: 提交额度申请 → 审核 → 生效
  - label: 审计导出
    status: 按条件过滤并导出 CSV
integrations: [Nuxt 4, Nitro, SQLite (sql.js), Docker, Nginx, Let's Encrypt, Webhook]
cover: /images/projects/dmx-token-self.svg
demoUrl: https://token.ytn520.top/
sourceVisibility: private
---

## 项目背景

团队内部使用大模型 API 网关的令牌，上游按来源 IP 限频，多人共用出口 IP 时查询频繁把窗口打满；同时令牌的发放、额度与审计长期靠人工。这套系统把「查询、发放、审核、审计」收敛到一个站点里。

## 技术方案

- Nuxt 4 + Nitro 单体应用，Docker 容器部署，nginx 反代并强制 SSR/API 响应 no-store、静态资源 immutable。
- 查询链路先过本站限流，再查 90 秒缓存，未命中才请求上游；失败结果不缓存并计入防爆破窗口，同 IP 失败累计触发 webhook 告警。
- 会话采用 HMAC cookie + scrypt + 密码指纹，支持滑动续期与 2FA；登录限流按账号维度计算，不信任 XFF 头。
- proxy 与 db 双模式共用同一套页面与审计口径：线上透传上游，本地走 SQLite 闭环，便于测试与演示。

## 交付与边界

源码托管在私有仓库，不对外提供访问。线上站点为内部使用，仓库与文档不含任何密钥与服务器凭据。
