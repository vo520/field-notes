---
title: 两个弹层：一个点遮罩关不掉，一个靠父页面直接改子组件的内部变量
description: 基于首页活动弹层与积分规则弹层的真实源码，拆解两种弹层实现：popover 用 :show 单向绑定导致点遮罩无效、积分弹层没有 open 方法只能由父页面直改 showPopup；以及无「不再提示」、safeArea 缺失时高度为 0、富文本 decode 无兜底这些具体问题。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 弹层, 代码质量]
chapter: components
order: 4
level: intro
featured: false
draft: false
project: robot-forum-miniapp
---

项目里有两个自己写的弹层：首页的运营弹窗（popover，69 行）和积分页的规则弹层（integral-popup，44 行）。

它们都基于 `up-popup`，但控制方式完全相反。一个把开关藏在组件内部、只暴露 `show()`；另一个连 `show()` 都没有，靠父页面直接 `$refs.xxx.showPopup = true` 改子组件内部变量。

## 1. 用户要完成什么

| 用户动作 | 走到的代码 | 用户看到 |
| --- | --- | --- |
| 进首页 | `onLoad` → `getPopoList()` → `$refs.popover.show(obj)` | 屏幕中间一张运营图 + 右上角关闭图标 |
| 点运营图 | `toUrl()` 关闭弹层 → `emit("onClick")` → `openArticle(popoverObj)` | 跳 webview / 帖子 / 活动 |
| 点关闭图标 | `close()` → `visible = false` | 弹层消失 |
| 点遮罩 | u-popup 只发 `update:show` 事件 | 什么都不会发生 |
| 点积分页「积分规则」 | 拉规则接口 → `decodeURIComponent` → `$refs.integralPopup.showPopup = true` | 底部升起圆角弹层，里面是富文本 |
| 关规则弹层 | `closeable` 的关闭按钮或 `@close` | 弹层落下 |

两个弹层没有任何关联，代码上唯一的共同点是都用 `up-popup` 做壳。

## 2. 页面要怎么走

### 2.1 首页运营弹层的触发链

弹层不是常驻组件，只有拿到配置才显示：

```js
// pages/index/mixins/popover.js:13-36
async getPopoList() {
    try {
        const res = await popoverListApi()
        let list = res && res.data ? res.data : []
        if (typeof list === "string") {
            try {
                list = JSON.parse(list)
            } catch (e) {
                list = []
            }
        }
        if (!Array.isArray(list)) list = []
        const popoverObj = list.find(item => item.status === 1)
        if (!popoverObj || !popoverObj.imageUrl) return
        this.popoverObj = popoverObj
        if (this.$refs && this.$refs['popover'] && typeof this.$refs['popover'].show === 'function') {
            this.$refs['popover'].show(this.popoverObj)
        }
    } catch (e) {
        console.warn("[getPopoList] fail", e && e.message)
    }
}
```

三步：归一化数据（字符串就 `JSON.parse`、非数组就清空）、找第一条 `status === 1`、确认有图再调 `show()`。

这里的数据归一化比同项目另外两处配置接口严谨——`member.js` 和 `swiperSetting.js` 都假定后端返回 JSON 字符串，直接 `JSON.parse`。同一个 `/biz/config/key/*` 系列，三种解析写法。

`$refs` 的空守卫也写了：`onLoad` 早于模板挂载，极快响应下 `$refs['popover']` 可能是 `undefined`。不过这段守卫只防住这一次——如果它真为 `undefined`，弹层就直接不弹了，也没有重试。

### 2.2 弹层的结构

```html
<!-- components/popover/index.vue:2-8 -->
<up-popup :show="visible" mode="center" bgColor="transparent">
    <view class="wrap">
        <image :src="closeIcon" class="icon" @tap="close"></image>
        <view class="line"></view>
        <image :src="popoverObj.imageUrl" mode="widthFix" class="img" @tap="toUrl"></image>
    </view>
</up-popup>
```

外层 `bgColor="transparent"` 去掉了 u-popup 默认的半透明黑底，所以弹层背后是正常亮度的页面。内容竖排：72rpx 的关闭图标靠右，60rpx 的竖线把图标和图片连起来，下面是 488rpx 宽的运营图。

关闭图标放在图片上方而不是压在图片右上角，所以运营图不用预留关闭按钮的位置，设计稿换图不用改代码。

### 2.3 点图片和点遮罩

```js
// components/popover/index.vue:28-34
close() {
    this.visible = false;
},
toUrl() {
    this.visible = false;
    this.$emit("onClick")
}
```

点图先关弹层再抛事件，页面接住后走 `openArticle(this.popoverObj)`（`popover.js:10-12`）。`clickPopover(index)` 的参数没有用到——页面侧用的是 mixin 写进 `data.popoverObj` 的那一份，组件内部的 `popoverObj` 只负责渲染。同一个对象存在两份，靠 `show()` 参数和 `this.popoverObj = popoverObj` 同时写。

点遮罩是另一回事。`up-popup` 的遮罩点击实现是：

```js
// uni_modules/uview-plus/components/u-popup/u-popup.vue:185-190
overlayClick() {
    if (this.closeOnClickOverlay) {
        this.$emit('update:show', false)
        this.$emit('close')
    }
}
```

它只发事件，不改自己的显示状态——显示状态是 `u-transition :show="show"` 由 prop 驱动的。popover 用的是 `:show="visible"` 单向绑定，既没写 `v-model`，也没监听 `close`，所以遮罩点击后两个 emit 都没人接，弹层纹丝不动。用户只能点右上角的 X。

### 2.4 积分规则弹层

```js
// pages/integral/index.vue:74-84
async toReadDoc() {
    try {
        const res = await integralRuleTextApi()
        if (res && res.data) {
            this.document = decodeURIComponent(res.data)
            this.$refs.integralPopup.showPopup = true;
        }
    } catch (e) {
        console.warn("[integral.toReadDoc] fail", e && e.message)
    }
}
```

父页面直接把子组件的 `data.showPopup` 置为 `true`。子组件没有 `open()` 方法，也没有把开关做成 prop，所以这是唯一能打开它的方式——封装在这里是不存在的。

接口是公开的 `get('/biz/config/key/integralRuleText', {}, false)`（`api/index.js:199-201`），返回一段编码过的富文本，前端 `decodeURIComponent` 后塞进 `rich-text`。

### 2.5 底部弹层的高度

```js
// components/integral-popup/index.vue:21-31
popupInnerStyle() {
    let height = 0;
    if (this.sysInfo.safeArea) {
        height = this.sysInfo.safeArea.height
    }
    return {
        'height': `${height*0.7}px`
    }
},
```

高度取安全区高度的 70%。`sysInfo` 由积分页 `onLoad` 里的 `uni.getSystemInfoSync()` 传进来（`integral/index.vue:63`）。

`safeArea` 在小程序里通常都有，H5 端或某些旧版本可能为空——那种情况下高度算出来是 0，弹层里只剩 `padding: 90rpx 40rpx 32rpx` 撑出来的一条白带，内容区高度为 0。

90rpx 的顶部内边距是给 `closeable` 的关闭按钮让位的：按钮浮在弹层右上角，内容从它下面开始。

## 3. 空和失败怎么处理

### 3.1 没有配置就不弹

`getPopoList` 有两道判断：`find` 不到 `status === 1` 直接 return，有对象但没 `imageUrl` 也 return（`popover.js:25-27`）。组件内部 `show()` 又判断了一次（`popover/index.vue:23-26`）。同一条件写两遍，但至少不会出现「黑遮罩上一张破图」。

### 3.2 弹层没有「不再提示」

弹层只在 `onLoad` 拉一次，没有记录关闭时间、次数或「今天不再显示」的 storage。用户每次冷启动进首页都会看到同一张图；下拉刷新和 `onShow` 不会重新弹，因为 `getPopoList` 只挂在 `onLoad` 上。

### 3.3 运营图可能超出屏幕

图片是 `mode="widthFix"`、宽度 488rpx，高度随比例走，没有 `max-height`。竖长图（比如 3:5 的活动海报）算下来接近 810rpx，加上关闭图标和竖线，在矮屏上会顶到屏幕外，而 `mode="center"` 的弹层没有滚动容器。

### 3.4 图片配了链接但点了没反应

`toUrl()` 无条件关闭并 emit，页面无条件 `openArticle(this.popoverObj)`。`openArticle` 只在 `obj.target` 存在时才跳（`tools/util.js:267-289`），所以配置里漏填 `target` 时，用户点图 → 弹层消失 → 什么都没发生，没有提示。

另外弹层跳转没有 `checkAuth()`：如果运营配置的是帖子或活动（`type` 为 1 / 2），未登录用户会直接被推进详情页。首页轮播对同样两种类型是先 `checkAuth` 的（`pages/index/mixins/swiperList.js:29-32`），两条入口策略不一致。

### 3.5 规则接口失败只有一个 warn

`toReadDoc` 的 catch 只 `console.warn`。用户点「积分规则」，接口超时或 500，界面没有任何反馈——没有 toast，按钮也没有 loading 态。再点一次才会重发。

### 3.6 富文本 decode 没有兜底

`decodeURIComponent(res.data)` 直接写在 try 里，`%` 序列非法时抛 `URIError`，同样落进只 warn 的 catch。这段富文本也没有任何样式约束，后端配一张宽图，`rich-text` 里就会横向溢出。

## 4. 界面为什么要这样排版

### 4.1 居中弹层不加暗底

`bgColor="transparent"` 是刻意的：运营图本身带完整视觉，加一层黑色遮罩会让图片发灰。代价是弹层和页面之间没有层次区分，只能靠图片本身的阴影和留白。

### 4.2 关闭图标与竖线

`.wrap` 是 `flex-direction: column; align-items: flex-end`（`popover:40-43`），所以图标、竖线、图片都靠右对齐。竖线用伪元素画在 `.line` 上，`right: 36rpx; transform: translateX(-50%)`——正好是 72rpx 关闭图标的水平中心。这是一条把一个 60rpx 的视觉空隙做成「从关闭按钮垂下来的引线」的小处理。

### 4.3 底部弹层的比例

`mode="bottom"` + `:round="10"` + 安全区 70% 高度，是移动端「规则说明」的标准形态：从底部升起、顶部圆角、固定高度内部滚动。`scroll-view` 占满内部高度，长规则不会把弹层撑破。

选 70% 而不是 90%，是为了让背后的积分列表露出来一部分，用户知道自己在哪一层。

## 5. 代码怎么落地

### 5.1 结构

```
components/popover/index.vue            69  居中运营弹层：内部 visible、show()/close()、图片点击
pages/index/mixins/popover.js           37  拉配置、归一化、find(status===1)、$refs 守卫
components/integral-popup/index.vue     44  底部规则弹层：内部 showPopup、safeArea 70% 高度
pages/integral/index.vue               109  使用方：decode 富文本后直改子组件 showPopup
```

### 5.2 阅读顺序

1. `pages/index/index.vue:32` + `onLoad` 里的 `getPopoList()`——先确认弹层在页面上的位置和触发时机。
2. `popover.js:13-36`——数据归一化和三道守卫。
3. `popover/index.vue:2-8`——结构：图标、竖线、图片。
4. `popover/index.vue:23-34`——`show` / `close` / `toUrl` 三个方法，以及为什么遮罩点不掉。
5. `integral-popup/index.vue:2-10`——底部弹层的壳。
6. `integral-popup/index.vue:21-31`——高度计算和 `safeArea` 依赖。
7. `integral/index.vue:74-84`——父页面直改子组件内部变量的那三行。

### 5.3 真实问题

| # | 问题 | 位置 |
| --- | --- | --- |
| 1 | `:show` 单向绑定且不监听 `close`，点遮罩关不掉，只能点 X | `popover/index.vue:2`、`u-popup.vue:185-190` |
| 2 | 弹层没有「不再提示」，每次冷启动都弹同一张图 | `popover.js:13`、`index.vue:145` |
| 3 | 运营图 `widthFix` 488rpx 无最大高度，长图在矮屏超出可视区 | `popover/index.vue:6,45-47` |
| 4 | 配了图没配 `target` 时，点击只关闭弹层、无任何反馈 | `popover/index.vue:31-34`、`util.js:267-289` |
| 5 | 弹层跳转无 `checkAuth`，与首页轮播对 type 1/2 的处理不一致 | `popover.js:10-12` |
| 6 | 同一个弹层对象存在两份（组件 data 与页面 data），靠调用方手工同步 | `popover/index.vue:19,25`、`popover.js:28` |
| 7 | `clickPopover(index)` 参数未使用 | `popover.js:10-12` |
| 8 | 三层配置接口三种解析方式：popover 归一化、member 直接 parse、swiperSetting 带默认值 | `popover.js:17-24`、`member.js:19-22`、`swiperSetting.js:24-32` |
| 9 | 积分弹层没有 open/close 方法，父页面直改子组件 `showPopup` | `integral/index.vue:79`、`integral-popup:18` |
| 10 | 高度取 `safeArea.height * 0.7`，`safeArea` 缺失时为 0，只剩一条白带 | `integral-popup:21-31` |
| 11 | 打开前无 loading、无请求锁，连点「积分规则」会重复请求 | `integral/index.vue:74-84` |
| 12 | 规则接口失败只 warn，用户侧零反馈 | `integral/index.vue:81-83` |
| 13 | `decodeURIComponent` 无兜底，非法 `%` 序列抛错后同样静默 | `integral/index.vue:78` |
| 14 | 富文本无样式约束，宽图直接横向溢出 | `integral-popup:5-7` |
| 15 | 两个弹层的关闭交互不统一：一个自定义 X，一个用 `closeable` 默认按钮 | `popover:4`、`integral-popup:2` |
| 16 | 首页、我的、积分页三份 `onShareAppMessage` 都是空 `title`，同一段代码复制三次 | `index.vue:81-84`、`mine/index.vue:35-48`、`integral/index.vue:40-43` |

### 5.4 验证

- `npm test`：10 个测试文件、147 项全部通过。
- `npm run check`：95 个文件，0 error / 0 warning / 0 hint。
- `npm run build`：Pagefind 索引 98 页，构建无报错。
- `npm run test:build`：构建冒烟 22 项通过。
- 产物：`dist/articles/popover-layers/index.html`、`dist/og/articles/popover-layers.png`。

两个弹层各自只有几十行，问题却集中在同一类：**开关状态没有一个明确的归属**。popover 把 `visible` 关在组件里，外部只拿到 `show()`，所以遮罩点击的事件没有接收方；integral-popup 把 `showPopup` 关在组件里又没给入口，父页面只能绕过封装去改。弹层这种东西，开关要么完全受控（prop + `update:show`），要么完全自治（暴露 open/close），两边各留一半，就会出现「点遮罩关不掉」和「父页面改子组件变量」这两种反面案例。
