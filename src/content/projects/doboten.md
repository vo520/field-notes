---
title: DOBOT 官网英文版
description: 越疆机器人英文官网的前端实现，与中文站共享信息架构，面向海外客户呈现产品与行业方案。
publishedAt: 2023-08-04
status: completed
category: 企业官网
tech: [HTML, CSS, JavaScript, PHP]
modules:
  - name: 多语言内容站点
    description: 面向海外客户的英文主站，并保留德语、日语、西语等语言模板。
    features:
      - 产品、行业应用、服务与新闻栏目共用信息架构
      - 语言维度拆分模板与内容配置
      - 响应式布局覆盖桌面与移动端
  - name: 服务与留资表单
    description: 提供培训、保修、订阅、合作、反馈等表单入口。
    features:
      - 表单控制器复用统一校验与入库流程
      - 请求参数通过验证组件检查
      - 邮件通知依托后端服务发送
  - name: 运营后台
    description: 后台集中维护栏目、文章、会员、消息与表单数据。
    features:
      - 独立后台入口与主题
      - 栏目与插件变更触发缓存更新
      - 内容与前台模板分离维护
  - name: 安全报告与活动
    description: 提供安全漏洞报告、研讨会、课程与活动报名等专项入口。
    features:
      - 安全报告表单
      - 研讨会与课程页面
      - 活动报名与留资
roles:
  - name: 海外访客
    scope: 浏览产品与行业方案、提交服务表单
  - name: 内容编辑
    scope: 在后台维护多语言栏目、文章与表单记录
workflow:
  - label: 内容维护
    status: 编辑在后台录入栏目与文章
  - label: 模板渲染
    status: 前台按语言维度载入对应模板
  - label: 缓存刷新
    status: 栏目与插件变更后重建数据缓存
  - label: 表单触达
    status: 访客提交后进入后台并触发邮件通知
integrations: [SumaCMS, Smarty, Eloquent, MySQL, Guzzle, PHPMailer, PhpSpreadsheet, CRM 推送, UTM 来源追踪]
cover: /images/projects/doboten.svg
demoUrl: https://www.dobot-robots.com/
sourceVisibility: private
---

## 项目背景

英文站服务海外客户与经销商，需要在中文站的信息架构基础上完成英文内容承载，并保持品牌视觉与交互一致。

## 技术方案

- 与中文站共用模板结构与组件样式，通过语言维度拆分内容与导航配置。
- 产品、方案、服务与新闻栏目保持一致的路由层级，便于中英文站点互相对应。
- 针对海外访问优化静态资源加载，图片与字体按需本地化。

## 交付与边界

源码托管在私有仓库，不对外提供访问。仓库保留前端模板与静态资源，服务端内容接口不在其中。
