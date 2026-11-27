---
title: 活动模块：一张海报加一个状态机，别把它当预约
description: 基于 uni-app 小程序活动模块的真实代码，拆解活动卡片、详情页状态机、图文视频混排、报名入口跳转、分享与预览，以及日期解析、安全区和空入口这些真实缺陷。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 活动, 工程实践]
chapter: pages
cover: /images/chapters/pages.svg
order: 6
level: practice
featured: false
draft: false
project: robot-forum-miniapp
---

活动模块只有两个文件：`components/activity-card`（首页里的卡片）和 `pages/activity/index`（活动详情）。它不负责报名，也不负责签到——「立即预约」点下去，打开的是后台配置的报名入口链接。

正因为职责少，它更像一个「内容详情页」：一张封面、三行基本信息、一段富文本、一组图文视频、一条固定底栏。真正复杂的是状态机——活动未开始、进行中、已结束，三种文案和按钮都不同。

## 1. 用户要完成什么

- 在首页看到进行中的活动卡片：封面、标题、日期、时间；
- 点进详情，看活动名称、起止日期、起止时间、地址、封面、活动简介和现场图片/视频；
- 点大图预览、播放视频；
- 点「立即预约 / 回顾活动 / 查看活动」，打开报名入口；
- 把活动详情转发给好友。

用户不会在活动页填任何表单。报名表单在后台配置的外链里，可能是一篇公众号文章，也可能是一个 H5。

## 2. 页面要怎么走

### 从首页进详情

首页 `getActivityList()` 拉 `POST /biz/event/listNoEndEvent`，顾名思义只返回「未结束」的活动。卡片只有整体一个 `@tap`：

```js
clickCard() {
  this.$emit("clickCard", this.info)
}
```

首页收到后走 `toActivity(item.eventId)`，先 `checkAuth()`（没登录先引导登录），再：

```js
openArticle({ type: 2, target: item.eventId })
```

`openArticle` 的 `type` 是全局枚举：`0` 外链 / 公众号文章、`1` 帖子、`2` 活动。`type: 2` 最终拼成：

```js
uni.navigateTo({ url: `/pages/activity/index?eventId=${obj.target}` })
```

`pages.json` 里这个页面的导航是蓝底白字、标题「活动详情」，和首页的蓝色头部连成一体。

### 详情页：`onLoad` 和 `onShow` 各拉一次

```js
onLoad(obj) {
  this.eventId = obj.eventId;
  this.getActivityDetail()
},
onShow() {
  this.getActivityDetail()
}
```

`onLoad` 先拿 `eventId` 再请求；`onShow` 无条件再请求一次。因为从活动页跳到报名 H5 再返回时，活动可能刚好开始或结束，状态需要重算。`loading` 是普通布尔锁，没有超时——如果第一次请求挂住，`onShow` 这次会被直接跳过。

### 状态机

状态不是后端字段，而是前端用当前时间和起止时间算出来的：

```js
statusStr() {
  if (this.activityDetail && this.activityDetail.createTime) {
    const nowTime = Date.now();
    const detail = this.activityDetail;
    const startTimeStr = `${detail.startDate} ${detail.startTime}`;
    const endTimeStr = `${detail.endDate} ${detail.endTime}`;
    const startTime = new Date(startTimeStr).getTime();
    const endTime = new Date(endTimeStr).getTime();
    if (nowTime < startTime) return "活动未开始"
    else if (nowTime > endTime) return "活动已结束"
    else return "活动进行中"
  }
  return ""
}
```

用 `createTime` 是否存在作为「详情已加载」的判据，而不是单独维护一个 `loaded` 标志。三种状态对应三种按钮文案：

| 状态 | 按钮文案 | 点击行为 |
| --- | --- | --- |
| 活动未开始 | 查看活动 | `openArticle({ type: 0, target: registrationEntryAddr })` |
| 活动进行中 | 立即预约 | 同上 |
| 活动已结束 | 回顾活动 | 同上 |
| 详情未加载 | 查看活动 | 同上 |

三种状态文案不同，行为完全一样。这是产品设计：详情页不判断能不能报名，报名入口自己处理截止。前端只负责把「现在是什么阶段」说清楚。

### 报名入口的两种打开方式

```js
clickBtn() {
  openArticle({
    type: 0,
    target: this.activityDetail.registrationEntryAddr
  })
}
```

`type: 0` 在 `openArticle` 里还有二次分流：

- 链接包含 `mp.weixin.qq.com`：调 `wx.openOfficialAccountArticle({ url })`，在微信内直接打开公众号文章；
- 其他链接：写 `webviewUrl` 到 storage，再 `navigateTo` 到 `/pages/webview/index`。

代码里还判断了宿主环境：`res.host.env == "WeChat"` 才走公众号 API，否则 toast 出宿主名并报错。也就是说，在 App 或浏览器里打开时，公众号文章这条路是走不通的，会看到一个错误提示。

如果 `registrationEntryAddr` 是空字符串，`openArticle` 开头的 `if (obj.target)` 直接不成立，函数静默返回——按钮点了没反应，也没有提示。

### 图文视频混排

详情接口的 `imageUrl` 是一个逗号分隔的字符串，可能是图片，也可能是视频：

```js
let arr = (data.imageUrl || "").split(",")
this.imgList = arr.filter(item => item).map(item => {
  return {
    type: isVideoFileBySuffix(item) ? 1 : 0,
    url: fixImgUrl(item)
  }
})
```

`isVideoFileBySuffix` 维护了 32 个视频后缀（`mp4 / mov / avi / mkv / flv / webm / 3gp …`），取文件名最后一个点后面的部分判断。模板按 `type` 分别渲染 `<image mode="widthFix">` 和 `<video controls>`。

图片预览需要只把图片放进 `urls`，视频不能参与。`previewImg(val)` 里 `current` 不是直接用 `val`，而是数了一遍前面有多少张图片：

```js
this.imgList.map((item, index) => {
  if (item.type == 0) {
    if (index == val) current = urls.length
    urls.push(item.url)
  }
})
```

否则第 3 个媒体如果前面有 1 个视频，预览会从错误的图开始。

## 3. 空和失败怎么处理

### 列表为空

首页 `activityList` 为空时整块 `v-if` 不渲染，没有「暂无活动」的空态。这是首页的取舍：活动是运营内容，没有就不占位置。

### 详情加载失败

```js
} catch (e) {
  console.warn("[activity.getActivityDetail] fail", e && e.message)
} finally {
  uni.hideLoading();
  this.loading = false;
}
```

失败只留一行日志，`activityDetail` 保持 `{}`。页面会变成：标题空白、三行「日期：至」「时间：至」「地址：」、封面为空、简介为空、底栏状态为空、按钮「查看活动」。没有错误页，也没有重试按钮。用户唯一的出路是返回再进。

### 日期解析失败会伪装成「进行中」

这是这个模块最隐蔽的问题。`new Date("2024-01-01 10:00")` 这种「横线日期 + 空格 + 时间」的格式，在部分 iOS 版本上解析为 `Invalid Date`，`getTime()` 得到 `NaN`。`nowTime < NaN` 和 `nowTime > NaN` 都是 `false`，于是代码落进 `else`，返回「活动进行中」。

后果是：只要后端把 `startTime` 从 `10:00:00` 改成 `10:00`，或者某个字段缺失，所有活动都会显示「立即预约」，按钮高亮成蓝色，用户点进去可能是一个已经结束的报名页。代码没有对 `Number.isNaN(startTime)` 做任何判断。

### 其他空值

| 场景 | 表现 |
| --- | --- |
| 封面为空 | `image` 宽度 100%、高度自适应，实际高度为 0，整块消失 |
| `imageUrl` 为空 | `split(",")` 得到 `[""]`，`filter` 后为 `[]`，媒体区不渲染 |
| 富文本为空 | `rich-text` 渲染空内容，标题「活动简介」仍然显示 |
| 报名入口为空 | 按钮可点，但没有任何反应 |
| 分享 | 标题传空字符串，微信用默认小程序名 |
| 列表卡片日期为空 | 显示「—」，不会出现 `NaN/NaN` |

最后一条是修过的。`activity-card` 里留着一段注释：

```js
// startDate/endDate 为 null/undefined 时，字符串拼接会变成 "null 00:00:00"
// 传给 new Date() 得到 Invalid Date，getMonth()/getDate() 后显示 "NaN/NaN - NaN/NaN"
```

修复方式是先判空再格式化，时间则固定拼一个 `2016-09-09` 的日期，只为取出 `HH:mm`：

```js
return `${st ? this.getShortTime('2016-09-09 ' + st) : '—'} - ${et ? this.getShortTime('2016-09-09 ' + et) : '—'}`;
```

同一个日期解析问题，列表卡片修了，详情页的状态机没修。这是这个模块里最值得记的一条。

### 底部安全区

底栏是 `position: fixed; bottom: 0`，但没有加 `padding-bottom: env(safe-area-inset-bottom)`。在全面屏 iPhone 上，状态文字和分享按钮会贴着 Home Indicator，触摸区域被系统手势占用。内容区用 `.media { margin-bottom: 120rpx }` 给底栏留了位置，但没算安全区。

## 4. 界面为什么这样排版

### 详情页是一张可滚动的海报

页面整体 `padding: 50rpx 0`，内容分两段，中间用加粗分割线（`divider/bold`）断开：

1. 封面区：标题 + 按钮同行，下面三行信息，最后通栏封面；
2. 简介区：「活动简介」小标题、富文本、媒体列表。

标题和按钮同行时，左侧标题必须写 `width: 0; flex: 1`：

```scss
.title {
  display: flex;
  .lf { width: 0; flex: 1; }
  .rt { margin-left: 20rpx; }
}
```

不写 `width: 0`，长活动名会把按钮挤出屏幕。这是 flex 子项 `min-width: auto` 的经典坑，项目里多处都用了同一个写法。

三行信息统一用 `.date` 类，行高 `40rpx`，字号 `28rpx`，靠 `pt` 全局类加上间距。封面用 `mode="widthFix"`、宽度 100%，高度随原图比例，不裁切——活动海报通常带文字，`aspectFill` 会切掉信息。

### 卡片是固定的 264 × 198

```scss
.lf {
  width: 264rpx;
  height: 198rpx;
  .cover { width: 100%; height: 100%; }
}
.rt {
  width: 0;
  flex: 1;
  height: 198rpx;
  padding-left: 20rpx;
}
```

左图右文，图片约 4:3，用 `aspectFill` 裁切保证所有卡片高度一致。标题两行截断（`.s2r` 是全局两行省略类），日期、时间各一行，字号 `24rpx` 灰色 `#666`。

「查看详情」按钮是绝对定位：

```scss
.abs-btn {
  position: absolute;
  bottom: 24rpx;
  right: 24rpx;
}
```

它不参与文字流，所以标题长短不会影响按钮位置；按钮本身没有绑点击事件，靠外层卡片的 `@tap` 冒泡触发。卡片阴影 `0 2px 8px rgba(0,0,0,0.06)`、下间距 `24rpx`、列表左右 `24rpx`，和首页其他白色卡片保持一致。

### 底栏：左操作、右状态

```scss
.btm-tools {
  position: fixed;
  bottom: 0;
  display: flex;
  border-top: 1px solid darken(#FCFCFC, 10%);
}
.item {
  width: 0;
  flex: 1;
  padding: 40rpx 0;
  background: darken(#FCFCFC, 3%);
}
```

两个 `flex: 1` 各占一半，中间用伪元素画 1px 竖线。左半是原生 `<button open-type="share">`——只有原生 button 才能触发微信转发，`view` 绑 `@tap` 不行；按钮自带边框和圆角被 `.item-btn` 全部清零。

右半是纯文字状态，进行中时加 `.active` 变品牌蓝 `#0047bb`。它不做成按钮，因为状态不可点，做成按钮会误导用户去点。底栏背景比页面底色（`#FCFCFC`）深 3%，用 `darken()` 而不是写死色值，保证换主题时一致。

### 分享图标

`<image :src="shareIcon" class="icon">`，图标 28 × 28rpx，右边距 8rpx，走 `static/icon/social/share.png`。分享按钮上同时有图标和文字，是底栏里唯一的图形元素。

## 5. 代码怎么落地

### 接口

| 动作 | 接口 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 活动列表 | `POST /biz/event/listNoEndEvent` | 否 | 只返回未结束活动 |
| 活动详情 | `POST /biz/event/byId/{eventId}` | 否 | 路径参数 |

两个接口都用 `post(url, {}, {}, false)`：方法是 POST、无 body、无 query、不需要 token。未登录用户也能看活动详情，登录校验只发生在首页点卡片那一刻。

### 字段映射

| 字段 | 用途 |
| --- | --- |
| `eventName` | 详情标题、卡片标题 |
| `startDate` / `endDate` | `YYYY-MM-DD`，卡片显示 `MM/DD` |
| `startTime` / `endTime` | `HH:mm[:ss]`，详情显示完整值 |
| `location` | 地址 |
| `coverUrl` | 封面，过 `fixImgUrl` |
| `eventDescription` | 富文本简介，直接给 `rich-text` |
| `imageUrl` | 逗号分隔的图片/视频地址 |
| `registrationEntryAddr` | 报名入口链接 |
| `createTime` | 只用来判断「详情是否加载」 |

`fixImgUrl` 负责两件事：把反斜杠 `\image` 修成 `/image`，以及给相对路径补 `baseUrl` 前缀。封面和媒体列表都过了一遍，富文本里的图片不过——`rich-text` 里的 `<img>` 由后端返回完整地址。

### 状态与按钮的耦合

`btnText` 是 `computed`，依赖 `statusStr`：

```js
btnText() {
  if (this.statusStr == "活动进行中") return "立即预约"
  else if (this.statusStr == "活动已结束") return "回顾活动"
  else if (this.statusStr == "活动未开始") return "查看活动"
  return "查看活动"
}
```

用中文字符串做判断条件，而不是枚举。好处是模板里直接 `{{statusStr}}` 就能显示；坏处是改文案必须同时改两个地方，而且拼写错误不会报错，只会静默落到默认分支。项目里多处都是这个模式，属于既有约定。

### 分享

和「我的」「积分」一样，分享不拼业务参数，直接复用当前路由：

```js
return {
  title: "",
  path: "/" + route + (query ? "?" + query : "")
}
```

`query` 来自 `page.options`，过滤 `undefined / null / 空串` 后用 `encodeURIComponent` 拼回去。这样转发出去的活动详情仍然带着 `eventId`，不会打开一个空页面。

### 预览的索引换算

```js
previewImg(val = 0) {
  let urls = []
  let current = 0
  this.imgList.map((item, index) => {
    if (item.type == 0) {
      if (index == val) current = urls.length
      urls.push(item.url)
    }
  })
  uni.previewImage({ urls, current })
}
```

`val` 是原数组下标（模板里 `previewImg(index)`），`current` 是图片数组下标。两者在有视频时不一致，所以必须先映射再传。封面单独一个 `previewCover()`，只预览一张图，`current: 0`。

### 与访客预约的边界

活动详情里的「立即预约」不会进入 `/pages/visit/index`。访客预约是另一条独立流程：选时段、填表单、查记录。活动报名完全交给后台配置的链接，可能跳公众号、可能跳 H5、也可能是一个第三方表单。

两条流程唯一的交点是首页：活动卡片和「访客预约」横幅都在首页，但点下去走向完全不同的页面。看代码时很容易误以为它们是同一套，实际上既没有共享状态，也没有共享接口。

---

活动模块的代码不多，但把「内容展示」和「状态判断」混在了一个页面里。展示部分靠 `widthFix`、`flex: 1` 和绝对定位，稳定；状态部分靠字符串日期解析，脆弱。列表卡片的 `NaN/NaN` 已经修过，详情页的 `Invalid Date → 进行中` 还留着——这两个是同一个问题，只是修了一半。
