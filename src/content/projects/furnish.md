---
title: 邻里装账
description: 面向装修业主的小区装修社区与私人装修账本，由 Go 服务端、Vue 3 运营后台和 uni-app H5 用户端三个公开仓库组成。
publishedAt: 2026-09-14
status: active
category: 社区服务
tech: [uni-app, Vue 3, TypeScript, Element Plus, Go 1.27, Gin, MySQL 8.4, Redis, MinIO, Docker Compose]
cover: /images/projects/furnish.png
demoUrl: https://furnish-h5.pages.dev/
repoUrl: https://github.com/xrlnewman/furnish-server
repositories:
  - name: furnish-miniapp
    role: frontend
    description: uni-app 用户端，当前交付 H5 网页版，保留 mp-weixin 工程结构以便后续转微信小程序；覆盖邻里信息流、材料价格、私人账本、合同增项与数据导出。
    tech: [uni-app, Vue 3, TypeScript, Vite, Pinia]
    url: https://github.com/xrlnewman/furnish-miniapp
  - name: furnish-admin
    role: admin
    description: 运营工作台，管理员登录需口令加动态验证码；覆盖内容审核、投诉申诉、小区与材料词典、用户工单、配置开关、指标健康、商品订单、资料与 AI，以及第三方接入配置、公告维护和审计日志。
    tech: [Vue 3, TypeScript, Vite, Element Plus, Pinia]
    url: https://github.com/xrlnewman/furnish-admin
  - name: furnish-server
    role: backend
    description: Go 1.27 + Gin 模块化单体，HTTP API、异步 worker、数据库迁移与管理员初始化共用一个二进制；同时携带 OpenAPI 契约、Compose 部署、脚本与跨端文档。
    tech: [Go 1.27, Gin, MySQL 8.4, Redis, MinIO, Docker Compose]
    url: https://github.com/xrlnewman/furnish-server
screenshots:
  - src: /images/projects/furnish/feed-mobile.png
    alt: 邻里装账 H5 邻里首页，展示所选小区、搜索框、内容类型筛选和邻里采购记录信息流
    title: 邻里首页
    caption: 按小区聚合采购价、装修日记、问一问与经历，先看邻里的经历，再做自己的决定；卡片直接给出实付总价和费用构成。
    viewport: mobile
    width: 780
    height: 1688
  - src: /images/projects/furnish/home-mobile.png
    alt: 邻里装账 H5 我家装修页，展示装修预算、已付净额、预付超付、在押押金和最近流水
    title: 我家装修
    caption: 私人账本总览把预算、已付净额、预付/超付与在押押金分开统计，押金不混入净支出；下方是记一笔、合同增项、装修日记入口和最近流水。
    viewport: mobile
    width: 780
    height: 1688
  - src: /images/projects/furnish/ledger-entry-mobile.png
    alt: 邻里装账 H5 记一笔表单，包含支付、到账退款、押金、押金退回四种流水类型和金额、日期、关联订单、支付方式、凭证
    title: 记一笔
    caption: 支付、到账退款、押金、押金退回四种私人流水，可关联采购单或增项，凭证仅自己可见，保存不会发布到社区。
    viewport: mobile
    width: 780
    height: 1688
  - src: /images/projects/furnish/material-detail-mobile.png
    alt: 邻里装账 H5 材料采购详情页，展示商品小计、配送上楼、加工优惠、安装等费项与落地总价、落地单价
    title: 材料采购详情
    caption: 把商品小计、配送上楼、加工优惠、安装等费项摊开，算出落地总价与落地单价；历史价格只代表当时成交，不承诺实时最低价。
    viewport: mobile
    width: 780
    height: 1688
  - src: /images/projects/furnish/flags-admin.png
    alt: 邻里装账运营后台配置与开关页，展示当前环境、公开发布、只读维护、支付与 AI 状态卡和开关限额列表
    title: 配置与开关
    caption: 后台按环境管理开关与限额，每次修改记录变更前后值、操作者与原因并可按历史回滚；支付与 AI 未配置第三方时即使开启也显示未开通。
    viewport: desktop
    width: 1440
    height: 1000
  - src: /images/projects/furnish/providers-admin.png
    alt: 邻里装账运营后台第三方接入配置页，展示微信登录、微信支付、内容安全、OCR、AI、短信、存储、统计八类服务卡片
    title: 第三方接入配置
    caption: 微信登录、微信支付、内容安全、OCR、AI、短信、存储与统计八类接入统一在后台配置；密钥加密保存只显示尾号，未配置的能力默认关闭，不伪造成功。
    viewport: desktop
    width: 1440
    height: 1000
modules:
  - name: 账号与小区
    description: 访客可浏览公开内容，产生个人数据时再登录；小区只代表自选，不做产权认证。
    features: [用户名口令注册登录, 微信登录（后台配置后启用）, 公开身份与自述标签, 城市区域小区选择, 新增小区申请与别名去重, 试点小区准入开关]
  - name: 社区内容
    description: 以小区为单位组织装修经验、采购价、装修日记和施工问答。
    features: [邻里信息流与类型筛选, 经验详情与来源说明, 问一问与回答, 评论与收藏, 站内搜索, 举报与反馈工单, 通知中心]
  - name: 发布与审核
    description: 公开内容必须经过字段选择、脱敏预览、单独同意、独立快照和审核。
    features: [结构化发布编辑器, 媒体上传与图片脱敏, 私账转公开快照, 审核后公开, 编辑撤回与版本历史, 分享前确认]
  - name: 材料价格
    description: 用完整费用口径比较材料价格，未知费用记 NULL 而不是 0。
    features: [落地总价与费用分解, 落地单价, 两条采购记录比较, 区域参考价（样本不足不给数）, 购买渠道与售后体验]
  - name: 我家装修
    description: 仅自己可见的私人装修账本，账务与社区内容完全分离。
    features: [项目与预算, 采购记录与采购单, 支付/退款/押金流水与冲正, 合同版本留档, 增项记录与确认, 装修日记, 阶段检查清单]
  - name: 协作与数据
    description: 数据可带走、可删除，协作权限撤销即时生效。
    features: [家庭成员邀请（24 小时单次有效）, 编辑者与只读成员, 免费 JSON/CSV 导出, 档案报告, 账号注销与清理队列]
  - name: 智能辅助与套餐
    description: 全部由后台开关和第三方配置控制，未配置时页面显示尚未开通。
    features: [报价单 OCR 与人工校对, 报价对比辅助, 施工疑问核验, AI 每日预算熔断, 套餐商品与订单, 权益与退款]
  - name: 运营后台
    description: 一个人也要有清晰的处理边界，所有敏感动作需理由并写审计。
    features: [内容审核, 投诉与申诉, 小区与材料词典, 用户与工单, 配置与开关, 指标与健康, 商品订单与对账, 资料与 AI 任务, 第三方接入配置, 公告与维护, 审计日志]
roles:
  - name: 访客
    scope: 浏览公开经验、价格与问答，不登录不产生个人数据。
  - name: 业主（项目所有者）
    scope: 维护私人账本、合同增项和日记，导出数据，邀请家庭成员，选择性公开分享。
  - name: 家庭成员
    scope: 按邀请授予编辑或只读权限访问项目，撤权后接口与附件访问即时失效。
  - name: 运营管理员
    scope: 口令加动态验证码登录，处理审核、工单、开关与第三方配置，所有动作写审计；对私人账本、合同和原图没有访问特权。
workflow:
  - label: 记一笔 / 采购记录
    status: 私人账本，仅自己可见
  - label: 选择字段生成公开快照
    status: 脱敏预览并单独同意
  - label: 提交审核
    status: 未配置审核服务时进入人工审核，不自动放行
  - label: 审核通过
    status: 进入邻里信息流与区域参考价
  - label: 撤回或紧急隐藏
    status: 公开副本失效，私账不受影响
metrics:
  - label: 验收用例
    value: 96 条 · 87 通过
    trend: 8 外部阻断 · 0 失败 · 1 未执行
  - label: OpenAPI 路由
    value: 213 条
    trend: 契约校验全部在文档内
  - label: 数据表
    value: 65+ 张
    trend: 迁移 up/down/up 校验通过
  - label: 公开 API p95
    value: 68.7 ms
    trend: 10 并发 · 10 万条公开记录 · 错误 0
integrations: [OpenAPI 3, MySQL 8.4, Redis, MinIO（S3 兼容）, Docker Compose, Cloudflare Pages, 微信登录 / 微信支付（后台配置，未联调）, 内容安全 / OCR / AI / 短信（后台配置，未联调）]
featured: true
draft: false
---

## 产品目标

邻里装账（英文名 furnish）把“装修社区”和“私人装修账本”放进同一个产品：先看同小区邻居的采购价、装修日记和施工问答，再把自己家的每一笔支出、合同和增项记清楚。产品坚持两条边界：私人账本与公开内容完全分离，公开必须经过脱敏和审核；费用未知就记为未知，历史价格只代表当时成交，不冒充实时最低价。

## 产品组成

三个公开仓库分别对应三端：`furnish-miniapp` 是 uni-app 用户端，当前交付 H5 网页版并保留微信小程序结构；`furnish-admin` 是运营工作台；`furnish-server` 是 Go 服务端，并随仓库发布跨端共享的 OpenAPI 契约、Compose 部署、脚本和文档。三个仓库互不依赖本机父目录。

演示地址：H5 用户端 [furnish-h5.pages.dev](https://furnish-h5.pages.dev/)，运营后台 [furnish-admin-60p.pages.dev](https://furnish-admin-60p.pages.dev/)。两处只部署了静态 UI，没有连接生产 API，页面会如实显示“服务尚未连接”，不用示例数据冒充联通。

## 功能模块

- **账号与小区**：访客可直接浏览公开内容，收藏、发帖、云端记账时再登录；网页端采用用户名口令注册登录，微信登录在后台配置后才启用；公开身份为自述业主或从业者，小区只代表自选，不做产权认证；城市区域小区选择、新增小区申请与别名去重、试点小区准入开关。
- **社区内容**：以小区聚合的邻里信息流（采购价、装修日记、问一问、经历），经验详情与来源说明，问答，评论与收藏，站内搜索，通知中心，举报与反馈工单。
- **发布与脱敏审核**：结构化发布编辑器，媒体上传时校验魔数、解码、像素上限并重新编码去除 EXIF，图片脱敏；私账转公开走“字段选择 → 脱敏预览 → 单独同意 → 独立快照 → 审核”；审核绑定内容版本，通过后才公开；编辑、撤回与版本历史。
- **材料价格**：落地总价按商品、配送、上楼、加工、安装、其他与优惠分解，任一费项未知则不参与排名和单价计算；两条采购记录逐字段比较；区域参考价只在独立成交样本足够时给出中位数和范围。
- **私人账本与采购**：项目与预算，采购记录和采购单，支付、到账退款、押金、押金退回四类流水，冲正保留原流水；应付、实付净额与押金分开统计。
- **合同与增项**：合同版本留档只读，增项记录与确认，已确认增项计入应付。
- **导出与注销**：免费的 JSON/CSV 基础导出，生成与下载分别鉴权；账号注销先处理未结事项，公开内容撤回或去标识化，私有数据进入清理队列。
- **家庭协作**：项目所有者邀请编辑者或只读成员，邀请链接 24 小时内单次有效，移除成员后接口和附件访问即时撤销。
- **清单与报告**：阶段检查清单、档案导出与项目报告（可打印 HTML 与 JSON）。
- **OCR 与 AI 辅助**：报价单 OCR 与人工校对、报价对比辅助、施工疑问核验助手，配有每日预算与成本熔断；未配置供应商时页面显示尚未开通。
- **套餐与支付**：套餐商品、订单、权益与退款；服务端定价，回调验签与幂等履约；售卖默认关闭，未配置商户时不显示商品。
- **运营后台**：内容审核、投诉与申诉、小区与材料词典、用户与工单、配置与开关、指标与健康、商品订单与对账、资料与 AI 任务八个工作台，以及第三方接入配置、公告与维护、审计日志。管理员登录必须带口令和 TOTP 动态验证码，会话 30 分钟滑动失效；保存配置、启停与连接测试都要填写理由并写审计，密钥加密保存、只显示尾号。

## 技术实现

服务端使用 Go 1.27 与 Gin，按领域拆成 auth、community、content、ledger、trust、commerce、intelligence、lifecycle 等模块，通过 `Register` 装配进同一个二进制；HTTP API、异步 worker、迁移与管理员初始化共用 `furnish` 命令。数据库为 MySQL 8.4：时间有序的 63 位主键、`DATETIME(3)` 存 UTC、金额整数分且未知记 NULL、可编辑实体带乐观锁版本、迁移幂等可回滚且跑过不改。Redis 承担限流令牌桶，MinIO 存放私有原件与公开衍生图，私有下载走网关逐请求鉴权，不发存储直链。

所有写接口要求 `Idempotency-Key`，同一操作重放返回同一响应，不同请求体返回 409；更新类请求携带 `version`，冲突时返回服务端当前对象并让前端保留输入。OpenAPI 契约是三端的唯一接口事实源，两端的 TypeScript 类型由契约生成，服务端启动时校验全部路由都在文档内。

用户端基于 uni-app、Vue 3 与 TypeScript，H5 使用自绘导航栏，不伪造小程序胶囊；后台基于 Vue 3、Vite、Element Plus 与 Pinia，品牌主题为橙红色，前端包不含任何密钥，API 地址在运行时注入。

## 运行方式

所有构建、安装、测试都在 Docker 内执行，工具链版本固定：Go 镜像 `golang:1.27.1-bookworm`，Node 镜像 `node:24.20.0-bookworm-slim`，用户端依赖固定为官方 uni-app preset 的整组版本，MySQL、Redis、MinIO 在 Compose 中固定 digest。

1. 克隆 `furnish-server`，并在同一目录下把 `furnish-admin` 克隆为 `admin-web`、`furnish-miniapp` 克隆为 `miniapp`，Compose 的构建上下文分别指向 `server/`、`admin-web/` 与 `miniapp/`。
2. 复制环境变量模板为 `deploy/.env.local`，填写数据库、Redis、MinIO 与应用密钥（文件已忽略提交，不进日志与文档）。
3. `scripts/compose.sh up -d mysql redis minio` 启动基础设施，`scripts/compose.sh run --rm migrate` 执行迁移，`scripts/compose.sh run --rm init-admin` 初始化管理员。
4. `scripts/compose.sh --profile app up -d` 启动 API、worker、后台与 H5，默认只绑定 127.0.0.1（API 18280、后台 18281、H5 18282）。

`scripts/go.sh` 与 `scripts/node.sh` 把 Go 和 Node 命令放进固定版本的容器执行，依赖缓存放在独立命名卷；容器出网通过 Docker Desktop 内置代理，不修改全局 Docker 设置。

## 当前状态

- **本地工程验收**：96 条验收用例在本地 Docker 栈执行，87 条通过；8 条外部阻断（真实支付、OCR/AI 供应商未配置，真机与屏幕阅读器本环境无设备；其中支付与 AI 的领域逻辑用替身供应商在集成测试中通过）；1 条未执行（M3 佣金/赞助只有声明字段、无独立接口）；发布候选 rc3 完成空卷初始化、备份恢复与回滚演练。
- **性能与安全**：公开只读接口在 10 并发、10 万条公开记录下两次 60 秒压测 p95 为 68.7 ms 与 71.1 ms，错误 0；安全测试覆盖跨项目遍历、协作撤权、附件伪装、SQL/XSS/SSRF 输入、幂等与乐观锁、CSV 公式注入、导出权限，限流的 `X-Forwarded-For` 绕过在测试中发现并已修复。
- **云端演示**：Cloudflare Pages 上只有静态 UI，未连接生产 API，页面显示“服务尚未连接”；生产 API 的部署位置尚未决定。
- **第三方能力**：微信登录、微信支付、内容安全审核、OCR、AI、短信均为后台配置项，目前没有任何真实资料接入，未做真实联调；未配置时对应能力关闭并如实显示未开通，不用测试替身冒充通过。
- **已知缺口**：发布候选镜像只在 linux/arm64 构建并验证；微信小程序产物未构建、未真机验收；用户端构建链存在上游 uni-app 依赖的 npm 高危提示（不进入运行产物）。
