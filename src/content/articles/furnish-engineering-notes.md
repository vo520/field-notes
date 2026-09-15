---
title: 邻里装账工程笔记：契约先行、幂等与私有公开隔离
description: 记录三端项目里几条真正省事的工程约定，以及一个本机 Docker 出网的坑。
publishedAt: 2026-09-14
tags: [Go, OpenAPI, Docker, 工程实践]
featured: false
draft: false
---

邻里装账是一个三端项目：Go 服务端、Vue 3 运营后台、uni-app 用户端。三个仓库并行开发，接口、数据和权限一旦各自理解，返工就会成倍增加。下面几条约定是这次真正省事的部分，也记一个踩过的环境坑。

## 契约先行

`contracts/openapi.yaml` 是三端唯一的接口事实源。后台和用户端的 TypeScript 类型都由契约生成，服务端把契约副本内嵌进二进制，启动时执行 `furnish openapi check`，凡是注册了却不在文档里的路由都会报错。截至 rc3 共 213 条路由全部通过这个检查。

一个小坑：契约里带 `default` 的属性会被 `openapi-typescript` 生成为必填字段。`DraftInput.is_example` 原本写了 `default: false`，前端类型就要求每次都传它。修法是去掉 `default`，由服务端解码时补默认值。

## 幂等与版本

所有 POST、PUT、PATCH、DELETE 都要求 `Idempotency-Key`。同一个操作者用同一个键重放，返回缓存的响应；键相同但路由或请求体摘要不同，返回 409 `IDEMPOTENCY_CONFLICT`。并发同键靠唯一索引加行锁，只执行一次。前端用 `useOperation()` 在一次用户操作开始时生成键，网络重试沿用，成功或用户改动输入后才换新键。

可编辑对象带 `version`，更新时 `WHERE id = ? AND version = ?`，影响行数为 0 就返回 409 `VERSION_CONFLICT`，响应里带服务端当前对象。前端收到 409 保留用户输入，展示服务端值，让人决定采用哪一边，而不是静默覆盖。

## 私有与公开隔离

私人账本、原始附件、合同和公开帖子、衍生图是两套数据。要把一条采购记录公开，只能走一条路：选择字段，生成脱敏预览，单独勾选同意，生成独立快照，进入审核。快照公开后，原记录再改也不会同步过去；撤回时公开副本返回 410，私账不受影响。

私有文件不发存储直链，统一走 `GET /assets/:id/download` 逐请求鉴权。管理员令牌打用户私有接口一律 401，无权限对象返回 404 而不是 403，避免泄露存在性。安全测试用两个陌生账号拿主人的各类对象 ID 打了 44 个接口，响应体去掉 `request_id` 后与随机不存在 ID 的响应逐项一致。

## 审核绑定版本

审核结果绑定 `(post_id, version, media_digest)` 三元组。作者提交后又改了一版，旧版本的审核回调不会覆盖新版本；撤回和紧急隐藏优先于通过。未配置内容安全供应商时，内容进入待人工审核队列，绝不自动放行。后台的审核动作都要原因码和理由，拒绝要二次确认，决策写审计并回显审计号。

## Docker 出网的坑

本机开着 VPN，容器内的 DNS 会把公网域名解析成 `172.19.0.x` 一类的假 IP，`npm install` 和 `go mod download` 直连全部超时，报错看起来像仓库挂了。Docker Desktop 自带的代理 `http://http.docker.internal:3128` 是通的，于是所有构建、安装、测试容器显式设置 `HTTP_PROXY`、`HTTPS_PROXY`，`NO_PROXY` 列出 `mysql`、`redis`、`minio`、`api` 这些内部服务名。`scripts/go.sh`、`scripts/node.sh` 和 Compose 的 `build.args` 都内置了这几个变量，不改全局 Docker 设置，也不影响其他项目的容器。

## 一句话总结

三端项目最贵的不是代码，是三方对同一件事的理解不一致。契约、幂等键、版本号和数据隔离都是把这种不一致提前变成明确的错误，而不是留到线上变成事故。
