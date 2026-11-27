---
title: 获赞与评论列表：两个同构页面的分页实现，和一个必定崩溃的第二页
description: 基于 pages/like-list、pages/comment-list 与 interact-item 的真实源码，拆解获赞/评论两页的同构分页、loadAll 判定、下拉刷新与触底加载，以及 this.rows 不存在导致第二页永远加载失败这个真实 bug。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 社区, 分页]
chapter: community
order: 5
level: practice
featured: false
draft: false
project: robot-forum-miniapp
---

「我的」页面上有两个数字：获赞和评论。点进去是两个几乎一模一样的列表页——`pages/like-list/index.vue` 和 `pages/comment-list/index.vue`，各 114 行，逻辑逐行对应，只差一个接口、一个 `type` 和几个参数。

同构的好处是维护成本低，坏处是同一个 bug 会被复制两份。这两个页面里就有这样一个 bug：上拉加载第二页时必定抛错，而且每次触底都会再抛一次。

## 1. 用户要完成什么

- 在「我的」页看到「获赞」「评论」两个数字；
- 点「获赞」，进入别人赞过我帖子的列表，看到对方头像、昵称、点赞时间、帖子首图；
- 点「评论」，进入别人评论过我帖子的列表，看到评论者头像、昵称、评论时间、评论内容、帖子首图；
- 点任意一条，跳到对应帖子详情；
- 下拉刷新列表；
- 上拉加载更多，直到看到「没有更多了」。

## 2. 页面要怎么走

### 入口：mine-info 按名字分发

```js
clickItem(item) {
  if (item.name == "获赞") {
    uni.navigateTo({ url: `/pages/like-list/index` })
  } else if (item.name == "评论") {
    uni.navigateTo({ url: `/pages/comment-list/index` })
  } else if (item.name == "帖子") {
    uni.setStorageSync("tabName", "post")
    // ...
  }
}
```

两个列表页都不带参数，也没有做登录校验——它们的身份完全依赖请求头里的 token。`mine-info` 只出现在需要登录的「我的」页，所以正常路径下一定有 token；但如果通过分享卡片或开发者工具直接打开列表页，页面本身不会拦。

### 两个页面只差四个地方

| | like-list | comment-list |
| --- | --- | --- |
| 标题 | 获赞 | 评论 |
| 接口 | `currentLikeListApi` | `currentCommentListApi` |
| 传给条目组件的类型 | `type="like"` | `type="comment"` |
| 每页条数 | 20 | 10 |

连排序字段都不一致：获赞按 `create_time` 排，评论按 `created_time` 排。这不是笔误，而是两个后端表字段名本来就不一样——同一个项目里两种命名并存。

### 首屏：一个 loading 锁 + 一个 loadAll 开关

```js
data() {
  return {
    loading: false,
    loadAll: false,
    likeList: [],
    queryParams: {
      pageNum: 1,
      pageSize: 10,
      orderByColumn: "created_time",
      isAsc: "desc",
      reasonable: true,
    },
  }
},
onLoad() {
  this.getList();
}
```

请求是 `post('/biz/comments/currentUserList', data, params, false)`，`auth` 传 `false` 表示「不强制登录」，但有 token 时拦截器照样会带上 `Authorization`，所以登录用户能拿到自己的数据。

```js
async getList(type) {
  if (!this.loading && !this.loadAll) {
    this.loading = true;
    uni.showLoading({ title: "" })
    try {
      const res = await currentCommentListApi(this.queryParams)
      if (type == "push") {
        this.rows.map(item => {
          this.likeList.push(item)
        })
      } else {
        this.likeList = res.rows || [];
      }
      const rowsLen = (res.rows || []).length;
      if (rowsLen < this.queryParams.pageSize || this.likeList.length >= (res.total || 0)) {
        this.loadAll = true;
      }
    } catch (e) {
      console.warn("[comment-list.getList] fail", e && e.message)
    } finally {
      uni.hideLoading();
      this.loading = false;
    }
  }
}
```

`type` 只有两种取值：不传（首屏、下拉刷新）和 `"push"`（触底加载）。首屏直接整体赋值 `likeList = res.rows || []`，追加时走 `this.rows.map(...)`——`this.rows` 在 `data` 里根本没有定义。

### 触底与下拉

```js
onReachBottom() {
  if (!this.loading && !this.loadAll) {
    this.queryParams.pageNum++;
    this.getList("push")
  }
},
async onPullDownRefresh() {
  this.loading = false;
  this.loadAll = false;
  this.queryParams.pageNum = 1;
  await this.getList();
  uni.stopPullDownRefresh();
}
```

触底先把 `pageNum` 加一再请求，请求失败也不会回退。下拉刷新则把 `pageNum` 重置为 1、清掉 `loadAll`，强制走首屏分支。

`pages.json` 里两页都开了 `enablePullDownRefresh: true`，`onReachBottomDistance: 50`，导航栏是品牌蓝底白字。

### 条目：一个组件，两套文案

`InteractItem` 接收 `type` 和 `info`，模板上有三个分支：

```html
<view class="nick-name">
  <text>{{nickName}}</text>
  <text class="date" v-if="type=='comment'">{{formatDate(info.createTime)}}</text>
</view>
<view class="content">
  <text v-if="type=='comment'">{{info.content}}</text>
  <text v-if="type=='like'">赞了你的帖子</text>
  <text class="date" v-if="type=='like'">{{formatDate(info.createTime)}}</text>
</view>
```

- 评论：时间放在昵称同一行右侧，第二行是评论内容；
- 获赞：没有评论内容，第一行只有昵称，第二行是固定文案「赞了你的帖子」加时间。

右侧缩略图取 `info.postsImage`，但会在 `watch` 里先判断是不是视频：

```js
watch: {
  info: {
    deep: true,
    immediate: true,
    handler(val) {
      if (val.postsImage) {
        this.getFirstImg()
      }
    }
  }
},
async getFirstImg() {
  if (this.info.postsImage) {
    if (isVideoFileBySuffix(this.info.postsImage)) {
      // 视频分支是空的
    } else {
      this.postImg = this.info.postsImage
    }
  } else {
    this.postImg = false;
  }
}
```

视频帖没有封面字段可用，所以视频分支留空，右侧整块缩略图不渲染。

点击整条跳详情：

```js
toPost() {
  if (this.info.postId) {
    uni.navigateTo({ url: `/pages/post/index?postId=${this.info.postId}` })
  } else {
    uni.showToast({ title: "帖子ID不能为空", icon: "none" })
  }
}
```

### 分享：把当前页的路由和参数原样拼回去

```js
onShareAppMessage() {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1];
  const route = page && page.route ? page.route : "";
  const options = page && page.options ? page.options : {};
  // ...拼 query...
  return { title: "", path: "/" + route + (query ? "?" + query : "") }
}
```

`title` 是空字符串，`path` 是当前列表页本身。这两个页面本来就没有参数，所以分享出去的永远是同一个列表入口。

## 3. 空和失败怎么处理

**第二页必定失败。** `this.rows` 在 `data` 里不存在，`this.rows.map` 会抛 `TypeError: Cannot read property 'map' of undefined`，被 `catch` 吞掉，只留一行 `console.warn`。然后 `finally` 把 `loading` 置回 `false`，`loadAll` 仍是 `false`，`pageNum` 也没有回退。

于是形成一个稳定的失败循环：

1. 首屏拿到第一页（10 或 20 条）；
2. 触底 → `pageNum` 变 2 → 请求成功拿到第二页 → 追加时抛错 → 第二页数据被丢弃；
3. 再触底 → `pageNum` 变 3 → 请求第三页 → 再抛错 → 丢弃；
4. 只要还有数据，第四页、第五页继续被跳过。

用户看到的现象是：列表停在第 10 条，底部一直转圈，怎么上拉都不出内容。如果某次请求的 `rows` 少于 `pageSize`，`loadAll` 会在抛错前被置为 `true`（那行代码在 `map` 之后，实际不会执行）——准确地说，抛错发生在 `loadAll` 判断之前，所以 `loadAll` 也不会被置位，转圈会一直持续。

**首屏失败**：`likeList` 保持 `[]`，`loadAll` 保持 `false`，页面是一整块白底加一个转圈，没有错误提示，也没有重试按钮。只能下拉刷新碰运气。

**空数据**：`rows` 是空数组时，`rowsLen = 0 < pageSize`，`loadAll` 变 `true`，底部显示「没有更多了」。但页面顶部没有任何「还没有人赞过你」「还没有评论」之类的空态文案，用户看到的是纯白页面加一句「没有更多了」。

**头像缺失**：`avatar` 计算属性直接返回 `info.userAvatar`，只有为空时才用内置的 `EmptyHeadImg`，没有经过 `fixImgUrl`。如果后端返回的是相对路径，这里会裂图；详情页的 `post-user-info` 是做过 `fixImgUrl` 的，两处不一致。

**缩略图缺失**：`postsImage` 为空或指向视频时，`postImg` 为空字符串，右侧 `v-if="postImg"` 不渲染，中间文字区会自动占满。

**时间缺失**：`formatDate` 返回空串，昵称后面不留空白。

**无 postId**：理论上不会发生，但代码仍然兜了一层 toast「帖子ID不能为空」。

**下拉刷新并发**：`onPullDownRefresh` 先把 `this.loading = false` 再调用 `getList()`。如果此时正好有一个触底请求还在路上，`loading` 被强行清零后，刷新请求会和它同时发出，两个响应谁后到谁覆盖列表。

## 4. 界面为什么要这样排版

两个页面共用一套列表结构：白底、上下各 20rpx 内边距，每条之间没有分割线，靠头像和留白分隔。

**单条是标准的三栏**：左 80rpx 圆形头像，中间自适应文字区，右侧 120rpx 方形缩略图。

```scss
.interact-item {
  display: flex;
  padding: 20rpx 40rpx;
  .lf { width: 80rpx; height: 80rpx; }        // 头像
  .cnt { width: 0; flex: 1; padding: 0 24rpx; } // 文字
  .rt { width: 120rpx; height: 120rpx; }      // 缩略图
}
```

`width: 0; flex: 1` 是这个项目反复出现的写法：中间栏先声明宽度为 0，再让它吃掉剩余空间。这样长昵称、长评论会被压缩换行，而不是把右侧缩略图挤出屏幕。

字号只有两级：昵称 32rpx `#333`，时间和内容都是 24rpx（时间 `#979797`，内容 `#000`）。昵称重、内容轻，是因为列表的扫读顺序是「谁 → 做了什么 / 说了什么」。

时间的位置是按类型分开设计的：评论的时间跟着昵称走，因为评论内容可能很长，时间放第二行会被挤到末尾；获赞没有内容，时间就放在「赞了你的帖子」右边，一行读完。

右图用 `aspectFill` 还是 `aspectFit` 值得注意：头像是 `aspectFill`（裁成圆形），帖子缩略图是 `aspectFit`（完整显示不裁切），因为缩略图的作用是「让用户认出是哪条帖子」，裁掉一半反而认不出。

底部只有 `up-loadmore`，上下各 20rpx。它只有两种状态：`loading` 和 `nomore`，没有 `loadmore`（可点击加载更多）——加载完全由触底事件驱动。

## 5. 代码怎么落地

**1）分页靠三个状态。** `loading` 防并发，`loadAll` 标记到底，`pageNum` 记录页码。三者缺一不可：少了 `loadAll`，到底后会一直请求空页；少了 `loading`，快速触底会发重复请求。这里三个都有，问题出在追加那一步的数据来源。

**2）第二页的正确写法。** 现在写的是 `this.rows.map(...)`，而 `res` 才是响应。最小修复是：

```js
if (type == "push") {
  ;(res.rows || []).forEach(item => this.likeList.push(item))
}
```

或者直接 `this.likeList = this.likeList.concat(res.rows || [])`。改一个地方要同时改两份文件，这正是同构代码的代价。

**3）`loadAll` 的判定有两道。** `rowsLen < pageSize` 是「这一页没满，说明到底了」；`likeList.length >= total` 是「累计条数够了」。任一成立就停。第二道依赖后端返回准确的 `total`，如果后端不返回，`res.total || 0` 变成 0，`likeList.length >= 0` 永远成立，首屏一进来就会 `loadAll = true`——这一点在接口返回缺字段时会立刻暴露。

**4）字段依赖是隐式的。** `InteractItem` 依赖 `nickName`、`userAvatar`、`content`、`createTime`、`postsImage`、`postId` 六个字段，页面和组件之间没有类型约束，后端改一个字段名，界面就静默变空（昵称变「匿名用户」，时间变空串，缩略图消失），不会报错。

**5）几处确定的缺陷清单**（都可在源码里直接定位）：

- 两个页面的 `this.rows.map` 都不存在，第二页起必定抛错，且页码只增不减，导致中间页被永久跳过。
- 首屏与加载更多失败都只 `console.warn`，无错误态、无重试。
- 列表为空时没有任何空态文案，只有「没有更多了」。
- 触底失败后 `pageNum` 不回退。
- `onPullDownRefresh` 强行把 `loading` 置 `false`，可能与在途请求并发。
- `showLoading({ title: "" })` 在每次请求时弹全屏遮罩，包括下拉刷新，遮罩会盖住系统下拉动画。
- 头像没走 `fixImgUrl`，与详情页处理不一致。
- `formatDate` 里有一行 `console.log("formatDate", val)`，每条每次渲染都打印。
- `like-list` 用 `create_time` 排序、`comment-list` 用 `created_time`，字段名不一致，任一侧后端改名都会让排序失效（还可能静默按默认字段排）。
- `simpleDate` 直接把后端时间串交给 `new Date()`，遇到 `YYYY-MM-DD HH:mm:ss` 这类格式在 iOS 上可能解析失败，列表时间会显示成 `NaN-NaN-NaN` 之类的异常值。
- 评论页的数组也叫 `likeList`，是从获赞页复制过来的命名残留，读代码时容易误判数据含义。

这个模块最值得记住的一点：同构页面能省一半开发时间，但一个 bug 也会变成两个。修 `this.rows` 的时候，两个文件都要改。
