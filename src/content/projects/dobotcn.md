---
title: DOBOT 官网中文版
description: 越疆机器人中文官网的模板化实现，覆盖产品、方案、服务与新闻栏目，与英文站共用一套内容结构。
publishedAt: 2023-08-04
status: completed
category: 企业官网
tech: [HTML, CSS, JavaScript, PHP]
modules:
  - name: 品牌内容栏目
    description: 承载产品、行业方案、服务支持与企业新闻的栏目结构和详情页。
    features:
      - 栏目与文章共用统一模型
      - 产品、案例与新闻复用栅格和卡片规范
      - 中英文站点按站点配置拆分内容
  - name: 服务表单与留资
    description: 统一收集留资、保修、培训、订阅、合作与生态合作申请。
    features:
      - 手机号格式校验与 12 小时重复提交拦截
      - 提交后写入对应业务表并通知运营
      - 表单记录可在后台集中查看
  - name: 运营后台
    description: 后台维护栏目、文章、产品、相册、表单、会员与多站点配置。
    features:
      - 使用非默认后台入口
      - 栏目与站点变更后重建模板缓存
      - 上传目录与运行缓存持久化
  - name: 小程序接口
    description: 为业务小程序提供新闻、产品、案例与详情的只读 JSON 数据。
    features:
      - 控制器白名单校验
      - 只返回已发布的数据
      - 统一响应结构与错误码
  - name: 会员与内容权限
    description: 后台维护会员身份，并按内容维度控制前台可见范围。
    features:
      - 会员中心入口
      - 内容权限标记
      - 登录态与 Session 联动
roles:
  - name: 站点访客
    scope: 浏览产品与方案、阅读新闻并提交服务表单
  - name: 运营编辑
    scope: 在后台维护栏目、文章、产品与表单记录
  - name: 小程序用户
    scope: 通过业务小程序读取公开资讯与产品内容
workflow:
  - label: 内容录入
    status: 运营编辑在后台维护栏目与文章
  - label: 缓存重建
    status: 栏目、站点或插件变更后刷新模板缓存
  - label: 多端发布
    status: 前台页面与小程序接口读取同一份数据
  - label: 表单跟进
    status: 留资校验入库后通知运营处理
integrations: [SumaCMS, Smarty, Eloquent, MariaDB, Redis Session, 腾讯云 SES, 微信小程序 API, 表单来源追踪]
cover: /images/projects/dobotcn.svg
demoUrl: https://www.dobot.cn/
sourceVisibility: private
---

## 项目背景

越疆机器人面向国内客户的品牌官网，需要在同一套信息架构下承载产品介绍、行业方案、服务支持与企业新闻，并保持长期可维护的栏目结构。

## 技术方案

- 采用 PHP 模板 + HTML/CSS/JavaScript 的页面组织方式，公共头尾、导航与页脚抽成可复用片段。
- 产品页、方案页与新闻列表复用统一的栅格与卡片规范，新增栏目时只需补充模板与内容。
- 静态资源本地化，配合响应式断点适配桌面与移动端浏览。

## 交付与边界

源码托管在私有仓库，不对外提供访问。当前仓库保留的是站点前端模板与静态资源，完整运行需要对应的内容管理后台。
