---
title: 首页：把九块业务拼成一屏，还要各自独立失败
description: 基于 uni-app 小程序首页的真实代码，拆解自定义导航的全屏轮播、个人信息卡、访客入口、功能宫格、活动与官网新闻、社区瀑布流的分区加载、翻页终止、锁超时与降级策略。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 首页, 工程实践]
chapter: pages
order: 1
level: practice
featured: false
draft: false
project: robot-forum-miniapp
---

首页是这个项目里唯一一个「什么都有」的页面：全屏轮播、个人信息卡、访客预约入口、功能宫格、活动列表、官网新闻、社区瀑布流、客服悬浮按钮、开屏弹窗，一共九块内容，来自七八个不同接口。

它没有统一的「加载中」页面，也没有统一的错误页。整页的策略是：谁失败谁空着，别拖累别人。这篇文章按五段拆：用户要完成什么、页面怎么走、空和失败怎么处理、界面为什么这样排、代码怎么落地。

## 1. 用户要完成什么

首页是 tabBar 第一项，也是 `pages.json` 里的启动页，采用 `navigationStyle: "custom"`，开了下拉刷新。用户在这里不做「完成任务」，而是找入口：

- 看轮播，点 banner 进入文章、帖子或活动；
- 点个人信息卡，去「我的」或去登录；
- 点「访客预约」横幅，进入预约选时段页；
- 点功能宫格：会员积分、访客预约、访客记录，或后台配置的外链文章；
- 看进行中的活动，点进活动详情；
- 看「最新动态」里的官网新闻，点进新闻详情；
- 刷社区瀑布流，点卡片看帖子，点收藏图标收藏；
- 点右下角客服按钮，直接打开企业微信客服会话。

所以首页的核心不是「流程」，而是「分流」：每一块内容点下去，走哪条路由、要不要登录，规则都不一样。

## 2. 页面要怎么走

### 首屏并发拉取

`onLoad` 里做六件事：拿 token、初始化 Pinia store、拉弹窗、拉宫格分区、拉帖子、拉轮播、拉新闻，然后调一次 `easyFresh()`：

```js
easyFresh() {
  const tasks = [
    this.getUserInfo(),
    this.getActivityList(),
    this.getIconList(),
    this.getSwiperSetting(),
    this.getNewsList()
  ];
  Promise.allSettled(tasks).catch(() => {});
}
```

这里用 `allSettled` 而不是 `all`，注释写得很直白：之前 `fire-and-forget` 链上任何一个 `reject` 都会阻断后面的调用，导致「首页数据加载不全」。现在单个模块失败只影响自己。

`onShow` 会刷新 token，并对轮播、帖子、新闻做「空了才补拉」，然后再跑一次 `easyFresh()`。`easyFresh` 里的接口都有 5 秒锁，所以 `onLoad` 刚拉过的新闻不会在 `onShow` 立刻重复请求——锁同时兼作去重。

### 下拉刷新与上拉翻页

下拉刷新先把 `queryDataP.pageNum` 复位成 1，再把七个锁和它们的时间戳统一清零：

```js
['loadingP', 'loadingS', 'loadingI', 'loadingA', 'loadingU', 'loadingSS', 'loadingN']
  .forEach(k => { this[k] = false })
['loadingPTime', 'loadingSTime', 'loadingITime', 'loadingATime',
 'loadingUTime', 'loadingSSTime', 'loadingNTime']
  .forEach(k => { this[k] = 0 })
```

注释说明了原因：如果上一次请求还没回来，锁仍是 `true`，这次下拉刷新会被直接吞掉。手动清零等于强制释放。

上拉触底只做一件事：`pageNum++` 再拉帖子。终止条件在 `getPostList` 里——本页返回空，或已加载数量达到 `res.total`，就把 `loadAllP` 置真，底部从「加载中」切成「没有更多」。

### 点击分流

| 点击对象 | 条件 | 去向 |
| --- | --- | --- |
| 轮播 banner | `type` 为 1 或 2 | 先 `checkAuth()`，再 `openArticle` |
| 轮播 banner | 其他 `type` | 直接 `openArticle` |
| 功能宫格 | 名称等于「会员积分」 | `/pages/integral/index`，不校验登录 |
| 功能宫格 | 名称等于「访客预约」 | `needLogin` 后去 `/pages/visit/index` |
| 功能宫格 | 名称含「访客记录」 | `needLogin` 后去 `/pages/visit/record` |
| 功能宫格 | 配了 `functionLink` | `openArticle` |
| 活动卡片 | `checkAuth()` 通过 | `/pages/activity/index?eventId=` |
| 帖子卡片 | `checkAuth()` 通过 | `/pages/post/index?postId=` |
| 新闻卡片 | `item.id` 存在 | `/pages/news/detail?id=` |
| 个人信息卡 | 有 token / 无 token | `switchTab` 到「我的」/ 跳登录页 |
| 客服按钮 | 无 | `wx.openCustomerServiceChat`，带企微 `corpId` |

`checkAuth()` 不是简单的「有没有 token」：没有 token 弹「当前操作需要登录 / 去登录」；有 token 但 `nickName` 为空弹「当前操作需要完善个人信息 / 去完善」。也就是说，注册完但没填昵称的用户，会被拦在内容详情页之外，先去补资料。

访客预约横幅反而刻意不设守卫，代码注释写明：选时段页允许匿名进入，真正需要登录的环节（提交、记录、详情）各自有 `needLogin` 兜底。入口宽松、关键动作收紧，这是有意为之。

## 3. 空和失败怎么处理

### 每个 mixin 自己兜底

首页的数据逻辑被拆成 9 个 mixin，每个 mixin 都自己 `try/catch`，失败时把对应字段置空或置默认值，只 `console.warn`，不弹全局错误：

| 模块 | 失败后的状态 |
| --- | --- |
| 轮播 | `swiperList`、`swiperRes` 都置 `[]` |
| 轮播设置 | 用 `_defaultSwiperSetting()`，指示器开、自动播、3 秒间隔 |
| 帖子 | 停止下拉动画、关 loading、锁复位，列表保持原样 |
| 活动 | `activityList = []`，整块因 `v-if` 不渲染 |
| 新闻 | `newsList = []`，整块不渲染 |
| 宫格 / 分区 | 各自置 `[]` |
| 用户信息 | `userInfo = {}`，卡片显示「未登录」或「匿名用户」 |
| 弹窗 | 静默失败，不弹 |

### 锁超时是首页的固定模式

七个数据方法都长这样：

```js
const now = Date.now()
if (this.loadingP && now - (this.loadingPTime || 0) < 5000) {
  return
}
this.loadingP = true;
this.loadingPTime = now;
```

没有这个时间戳，只要有一次请求挂住（弱网、后端不返回），锁就永远为 `true`，之后无论 `onShow` 还是下拉刷新都进不去，页面表现为「数据加载不全」。5 秒后允许重入，是这套代码里反复出现的同一个修复。

### 几个具体的空态

- 轮播列表为空时，`up-swiper` 的 `loading` 传的是 `swiperList.length == 0`，显示骨架而不是白块。
- 轮播数据会过滤掉 `bannerId === 6`，注释说明这是访客页专属头图，避免首页重复展示。
- 弹窗接口返回的可能是字符串，先 `JSON.parse`；找不到 `status === 1` 且带 `imageUrl` 的项就 `return`，注释写明是为了「避免只显示遮罩背景」。
- 新闻接口返回的可能是 `data.articles`，也可能直接是数组，两种都兼容；`image1` 和 `my_url` 是官网相对路径，统一补 `https://www.dobot.cn` 前缀。
- 新闻一次取 10 条，首页只展示前 5 条，完整 10 条写进 storage `offical_news_list_v1`，给详情页做上下篇用。
- 收藏是乐观更新：先改 Pinia，再发请求，失败只 `console.warn`，不回滚。代码注释说「用户可再次点击」。
- 图片统一过 `fixImgUrl`：把反斜杠 `\image` 修成 `/image`，没有 `http` 就拼 `baseUrl + prefix`，值为空则返回默认头像。

### 瀑布流的三处「防白屏」

`components/water-flow` 和 `mini-card` 里留着几条修复注释，能看出这里出过事故：

1. `mini-card` 的 `_postContent` 对空值返回空字符串。注释说历史脏数据会让空指针崩溃，整张卡片白屏，进而 `watch(lfHeight/rtHeight)` 不触发 `next()`，后续卡片永远不渲染。
2. `shortName()` 原来是 `if (val) return val`，`else` 分支里 `val.length` 必然抛错；现在改成先判空再截断 10 个字符。
3. `render()` 每次都重新 `uni.createSelectorQuery()`。注释说明微信小程序的 `selectorQuery` 是「一次性」的，`exec()` 之后同一引用再 `exec()` 会抛 `Cannot read properties of null`。所以既不能在 `mounted` 里复用，也不能在 `render` 里缓存。

这三条都不是设计，是被线上问题逼出来的。写文章时如果只看模板，会以为瀑布流只是简单双列布局。

## 4. 界面为什么这样排版

### 全屏轮播 + 悬浮个人信息卡

首页是自定义导航，所以轮播要自己顶到状态栏。`components/swiper` 的做法是先用两块占位撑出高度：

- `.status-bar` 高度等于 `systemInfo.statusBarHeight`；
- `.swiper-btm` 高度等于 `(326 - statusBarHeight) * 2rpx`，保证整体约 326px；
- `.swiper-box` 绝对定位 `top: 0`、`height: 100%` 盖住两块占位，`z-index: 99`；
- logo 用 `menuButtonInfo.height` 和 `menuButtonInfo.top` 定位，和右上角胶囊按钮对齐。

个人信息卡用负边距压上来：

```scss
.user-card {
  margin-top: -56rpx;
  position: relative;
  z-index: 999;
  padding: 0 24rpx;
}
```

卡片一半压在轮播底部、一半落在浅灰页面上，视觉上把「品牌图」和「个人信息」连成一块。轮播指示器也被下推到 `bottom: 76rpx`，避免被卡片盖住。

### 访客入口单独做一张渐变卡

`visit-entry` 没有放进功能宫格，而是单独做成蓝色渐变横幅（`linear-gradient(135deg, #0047bb, #2665e0)`），左侧标题加一行说明「预约到访越疆 · 查看预约进度」，右侧一个 `›`。它夹在个人信息卡和宫格之间，是整页唯一带渐变背景的块——因为它不是「功能入口」，而是当前主推的业务。

### 内容区用「白卡 + 浅灰底」

页面底色 `#FCFCFC`，所有内容块是纯白卡片，阴影统一 `0 2px 8px rgba(0,0,0,0.06)`，圆角 `8rpx`，左右外边距 `24rpx`。宫格内部用五列 grid：

```scss
.r-btm {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
}
```

`icon-area` 里还留着被注释掉的 `flex + space-between`，能看出从 flex 改成 grid 是为了让 5 个图标严格等宽，不随数量变化。

新闻卡片固定 `200rpx × 150rpx` 封面、右侧两行标题加两行摘要，日期用最浅的灰；活动列表只有存在数据才 `v-if` 渲染，避免出现一个只有标题的空区块。

### 社区瀑布流

`water-flow` 是左右两列各占 `flex: 1`，中间留 `24rpx`。第一张进左列，第二张进右列，之后每次比较 `lfHeight` 和 `rtHeight`，谁矮往谁那塞。卡片白底、`20rpx` 内边距、`24rpx` 下间距，图片 `mode="widthFix"` 随宽度自适应高度，所以两列高度天然不齐。

客服按钮 `position: fixed; right: 32rpx; bottom: 400rpx; width/height: 102rpx`，避开 tabBar 和内容操作区；图标是整张 PNG，按钮自身背景透明、`::after` 边框去掉。

## 5. 代码怎么落地

### 页面结构与数据源

| 区块 | 组件 | 数据来源 |
| --- | --- | --- |
| 轮播 | `Jswiper` / `up-swiper` | `POST /biz/banner/enableList` + `GET /biz/config/key/swiper` |
| 个人信息卡 | `JUserCard` | `GET /system/user/profile` |
| 访客入口 | 页面内联 | 无接口，固定路由 |
| 功能宫格 | `JIconArea` | `POST /miniProgram/functional/displayList` + `POST /miniProgram/functional/typeList` |
| 活动 | `JActivityList` | `POST /biz/event/listNoEndEvent` |
| 最新动态 | `JNewsCard` | `GET https://www.dobot.cn/api.php?controller=MiniApi&act=news&id=5` |
| 瀑布流 | `JWaterFlow` → `MiniCard` | `POST /biz/posts/list` |
| 开屏弹窗 | `JPopover` | `GET /biz/config/key/popover` |
| 客服 | `JFixedBtn` | 无接口，`wx.openCustomerServiceChat` |

### Pinia 里为什么要存两份帖子列表

`store/post.js` 有 `postList` 和 `indexPostList` 两份数据。首页只读写 `indexPostList`，论坛页用 `postList`。但收藏、点赞、评论数、分享数的更新会同时改两份：

```js
changeCollect(val) {
  updateCollect(this.postList, val)
  updateCollect(this.indexPostList, val)
}
```

原因是同一个帖子可能同时出现在两个页面，用户在详情页收藏后返回首页，首页卡片上的收藏状态必须已经变了。用同一个 store 做单一事实来源，比在每个页面 `onShow` 重新拉列表便宜得多。

### 瀑布流的分列算法

`render()` 一次只处理一个 item：

```js
if (this.listIndex == 0) {
  this.lfList.push(item); sid = "lf"
} else if (this.listIndex == 1) {
  this.rtList.push(item); sid = "rt"
} else if (this.lfHeight <= this.rtHeight) {
  this.lfList.push(item); sid = "lf"
} else {
  this.rtList.push(item); sid = "rt"
}
```

推入后 `$nextTick` 里重新测量该列高度；`watch` 到 `lfHeight` 或 `rtHeight` 变化就再调 `next()`。所以渲染是「一张一张」串行推进的，速度取决于布局测量回调，而不是一次性算完。数据追加时 `add()` 只把新项塞进 `list` 再触发 `next()`，不会重排已有卡片。

### 翻页与终止

`getPostList` 的查询参数固定为：

```js
queryDataP: {
  pageNum: 1,
  pageSize: 10,
  orderByColumn: "publish_time",
  isAsc: "desc",
  reasonable: true
},
searchDataP: {
  popularPost: 1,
  status: 1
}
```

按发布时间倒序、每页 10 条、只取热门且已发布的帖子。第 1 页走 `setIndexPostList` + `waterFlow.init()`，后续页走 `pushIndexPostList` + `waterFlow.add()`，两套方法分开，避免重复初始化打乱分列。

### 分享

`onShareAppMessage` 没有拼业务参数，而是直接复用当前页面路由和 query：

```js
const pages = getCurrentPages();
const page = pages[pages.length - 1];
const route = page && page.route ? page.route : "";
const options = page && page.options ? page.options : {};
```

title 留空，交给微信默认取小程序名。这样任何带参进入首页的链接，转发出去仍然带着同一组参数，不会丢。

---

首页的代码量在项目里算大的，但复杂度不在业务逻辑，而在「同时维护九块互不依赖的数据」。锁超时、`allSettled`、每个 mixin 独立兜底、瀑布流的串行渲染，都是同一个目标：任何一块挂了，页面剩下的部分还得能用。
