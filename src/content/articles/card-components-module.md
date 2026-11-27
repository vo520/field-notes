---
title: 列表卡片层：一条递归渲染的瀑布流，和四套各自为政的图片路径
description: 基于 components/post-card、mini-card、water-flow、news-card、activity-card、user-card、social-box 的真实源码，拆解两列瀑布流如何靠「测量—改高度—next()」的 watch 链逐条渲染，四种卡片各自的字段回退与空值兜底，以及图片路径在 mixin、组件 computed、页面三处重复归一、四个组件完全不管的现状。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 组件设计, 瀑布流]
chapter: components
cover: /images/chapters/components.svg
order: 2
level: deep
featured: false
draft: false
project: robot-forum-miniapp
---

首页和论坛的内容都以「卡片」出现，但它们的实现完全不在一个层面上：论坛是一列大卡，首页是两列瀑布流，中间夹着新闻卡、活动卡、用户卡，详情页又复用了同一套作者信息行和互动栏。

这一层一共 9 个组件、1311 行代码：

| 组件 | 行数 | 职责 |
| --- | --- | --- |
| `components/water-flow/index.vue` | 236 | 两列瀑布流容器，负责入列与测高 |
| `components/post-card/index.vue` | 236 | 论坛单列大卡（标题、正文、三图、视频、互动栏） |
| `components/mini-card/index.vue` | 147 | 瀑布流小卡（首图、摘要、作者、收藏数） |
| `components/news-card/index.vue` | 136 | 官网新闻横卡 |
| `components/social-box/index.vue` | 133 | 分享/收藏/点赞/评论四格互动栏 |
| `components/user-card/index.vue` | 127 | 首页悬浮用户条 |
| `components/activity-card/index.vue` | 118 | 活动横卡 |
| `components/post-user-info/index.vue` | 86 | 作者头像 + 昵称 + 发布时间 |
| `components/head-img/index.vue` | 44 | 圆形头像，带空头像兜底 |
| `components/u-water-flow/index.vue` | 48 | 基于 `up-waterfall` 的另一版实现，全项目零引用 |

最后一行是死代码：`u-water-flow` 没有任何页面或组件 import 它，而且它里面的 `MiniCard` 既没接 `@clickCard` 也没接 `@changeCollect`。真正跑在线上的是 `water-flow`。

## 1. 用户要完成什么

用户在卡片上只做四件事：

1. **浏览**：首页往下滑，两列卡片错落排开，每张卡有图、有五行内的正文、有作者头像和收藏数；论坛里则是一列大卡，正文最多五行，超过三张图只展示三张。
2. **进详情**：点卡片任意位置，跳到帖子详情。
3. **收藏/点赞**：点卡片右下角的收藏图标，图标变实心、数字加一；论坛大卡的互动栏里还能点赞。
4. **分享**：论坛大卡和详情页的互动栏里点分享，走微信原生转发。

首页还额外承担了两种「非社区内容」：官网新闻（最多 5 条）和活动（有数据才显示）。它们和帖子共用同一套卡片视觉，但数据字段完全来自另一套后端。

用户能感知的失败很朴素：图是空白或一张灰色头像、点了收藏没反应（没登录）、点卡片没跳转、分享出去的标题是空的。

## 2. 页面要怎么走

### 2.1 瀑布流是一条递归渲染链，不是 CSS 布局

`water-flow` 的模板只有两个固定容器 `#wf-lf`、`#wf-rt`，列表本身在 `data` 里：

```html
<view class="lf wf-lf" id="wf-lf">
  <view class="item auto-wrap" v-for="(item,index) in lfList" :key="`lf-${index}`">
    <MiniCard :info="item" @clickCard="clickCard" @changeCollect="changeCollect" />
  </view>
</view>
<view class="rt wf-rt" id="wf-rt">
  <view class="item auto-wrap" v-for="(item,index) in rtList" :key="`rt-${index}`">
    <MiniCard :info="item" @clickCard="clickCard" @changeCollect="changeCollect" />
  </view>
</view>
```

真正的调度在 `render()`（第 63-100 行）：

```js
let item = this.list[this.listIndex]
let sid = ""
if (this.listIndex == 0) {
  this.lfList.push(item); sid = "lf"
} else if (this.listIndex == 1) {
  this.rtList.push(item); sid = "rt"
} else if (this.lfHeight <= this.rtHeight) {
  this.lfList.push(item); sid = "lf"
} else {
  this.rtList.push(item); sid = "rt"
}
this.listIndex++;
this.$nextTick(() => {
  const selector = uni.createSelectorQuery().in(this)
  selector.select(sid == "lf" ? '#wf-lf' : '#wf-rt')
    .boundingClientRect((data) => {
      if (data) {
        if (sid == "lf") this.lfHeight = data.height
        else this.rtHeight = data.height
      }
    })
  target.exec();
})
```

规则很直白：前两条固定左右各一，之后每次放进当前更矮的那一列；放完立刻测量该列高度，写回 `lfHeight` / `rtHeight`。

驱动下一轮的不是循环，而是 `watch`（第 180-193 行）：

```js
watch: {
  lfHeight(val) {
    if (this.lfHeight) this.next();
  },
  rtHeight(val) {
    if (this.rtHeight) this.next();
  }
}
```

`next()` 只做一件事：`listIndex < list.length` 就再调一次 `render()`。于是整条链路是：

```
init() -> next() -> render() 第 1 条 -> $nextTick 测量 -> lfHeight 变化
      -> watch -> next() -> render() 第 2 条 -> 测量 -> rtHeight 变化
      -> watch -> next() -> ... 直到 listIndex == list.length
```

这里有两个必须知道的实现细节。

第一，`selectorQuery` 是一次性对象。`mounted` 里的注释明确写了：同一个 selector 上挂多个 `.boundingClientRect` 后 `exec()` 一次就会清空内部状态，第二次 `exec()` 会抛 `Cannot read properties of null (reading 'exec')`。所以 `render()` 每次都在 `$nextTick` 里**重新创建** `uni.createSelectorQuery().in(this)`，而不是复用 `mounted` 里那两个 `flBounding` / `rtBounding`。`mounted` 里只 `exec()` 一次，同时测两列，然后把 selector 挂到这两个字段上，注释说是「兼容旧字段，避免外部可能访问时报 undefined」——实际上没有任何外部代码访问它们。

第二，递归能走下去依赖一个隐式条件：**列高必须发生变化**。`watch` 只在值改变时触发；如果某次 `render()` 后测量失败（`data` 为 null），或者新卡片渲染出来列高恰好没变，`next()` 就不会被调用，剩余卡片会永远停在 `list` 里。代码用 `try/catch` 包住了测量，异常时只 `console.warn('waterFlow|render|exec|error', ...)`，注释写的是「取不到高度仅影响下次分栏判定，不会让用户看到错误」——但在这条链里，取不到高度不只是分栏不准，而是直接断链。

### 2.2 谁在喂数据：pageNum 决定 init 还是 add

瀑布流自己不请求数据，`init` / `add` 都由首页的 `postList` mixin 调用（`pages/index/mixins/postList.js` 第 54-64 行）：

```js
if (this.queryDataP.pageNum == 1) {
  this.store.setIndexPostList(list)
  if (this.$refs && this.$refs["waterFlow"] && typeof this.$refs["waterFlow"].init === "function") {
    this.$refs["waterFlow"].init(list)
  }
} else {
  this.store.pushIndexPostList(list)
  if (this.$refs && this.$refs["waterFlow"] && typeof this.$refs["waterFlow"].add === "function") {
    this.$refs["waterFlow"].add(list)
  }
}
```

`init(val)` 重置 `list`、`listIndex`、两列数组和两个高度，然后 `next()`；`add(val)` 只往 `list` 末尾追加，然后 `next()`。注意 `add` 追加时**不会**重置 `listIndex`，所以第二页数据会从第一页停下的位置继续入列——这是正确的；但它也不会重置 `lfHeight` / `rtHeight`，两列高度的基准要等下一次测量才更新，中间那一瞬间的分栏判定用的是旧值。

`$refs` 的三重判空（refs 存在、`waterFlow` 存在、`init` 是函数）是必要的：首页 `onLoad` 里就会发起请求，而 `waterFlow` 在模板里排在新闻区之后，首次渲染时 ref 可能还没挂上。这也是为什么首页在 `onShow` 里还有一条「`postList.length === 0` 才重拉」的兜底。

### 2.3 五种卡片读的是五套字段

**`mini-card`（首页瀑布流）**：首图从 `postImageList` 里找第一个 `imageType == 0` 的项，正文取 `postContent`，作者取 `avatar` + `nickName`，收藏取 `isFavorite` + `favoritesCount`。

**`post-card`（论坛列表）**：标题 `postTitle`、正文 `postContent`、图片同样是 `imageType == 0`、视频是第一个 `imageType == 1`、互动数据与 `mini-card` 同名。区别是它把「三图以上只显示前三张」写在了 `v-show="index<3"` 上。

**`news-card`（官网新闻）**：字段全来自 PHP CMS，回退链写在 computed 里（第 25-60 行）：

```js
title() { return i.title || i.newsTitle || i.titleName || i.name || '' }
desc() {
  const raw = i.content_small || i.content_full || i.summary || i.description || i.desc || i.intro || ''
  // 先按表解码 HTML 实体，再 replace(/<[^>]+>/g,'') 去标签，最后 slice(0, 60)
}
coverImg() { return i.image1 || i.coverUrl || i.imageUrl || i.thumbUrl || '' }
date() { return i.date || '' }
```

实体表里同时列了 `&lsquo;` 和 `&amp;lsquo;` 这种二次转义形式，说明这份数据被转义过两次，只解一层会漏出 `&lsquo;` 这样的字符串。摘要截断是 `slice(0, 60)`，按字符数而非宽度。

**`activity-card`（活动）**：`eventName`、`startDate`/`endDate`（日期部分）、`startTime`/`endTime`（时间部分），由 `formatDateRange()` / `formatTimeRange()` 拼成 `MM/DD - MM/DD` 与 `HH:mm - HH:mm`。

**`user-card`（首页用户条）**：`avatar`、`nickName`，再加一个 `token` prop 决定文案。

### 2.4 图片路径没有统一入口

这是这一层最值得记的一件事：**同一个后端返回的相对路径，被四个不同地方各自处理了一次，还有四个组件完全不处理。**

`tools/util.js` 的 `fixImgUrl` 是唯一的标准实现（第 17-33 行）：

```js
export const fixImgUrl = (val) => {
  if (val) {
    if (/\\image/.test(val)) val = val.replace(/\\image/, "/image")
    if (!/http/.test(val) && !/https/.test(val)) val = baseUrl + prefix + val
  } else {
    val = EmptyHeadImg
  }
  return val;
}
```

注意最后那个 `else`：**空值不是返回空串，而是返回一张空头像图**。

按责任层拆开看：

| 位置 | 处理了什么 | 代码 |
| --- | --- | --- |
| 首页 `postList` mixin | `avatar` + 每张 `postImageList[].imageUrl` | 第 46-53 行 |
| 首页 `activityList` mixin | 活动 `coverUrl` | 第 33-36 行 |
| 首页 `newsList` mixin | `image1` / `my_url` 拼 `https://www.dobot.cn` | 第 41-49 行 |
| 首页 `userInfo` mixin | 用户 `avatar` | 第 44 行 |
| `post-card` computed | 在组件内对图片和视频各调一次 `fixImgUrl` | 第 96-124 行 |
| `post-user-info` computed | 对 `avatar` 调一次 | 第 33-35 行 |
| `mini-card` | 不处理，`getFirstImg()` 原样返回 | 第 68-79 行 |
| `head-img` | 不处理，`:src="head"` 原样渲染 | 第 3 行 |
| `user-card` | 不处理，`:src="info.avatar"` | 第 5 行 |
| `news-card` | 不处理，靠 mixin 拼官网域名 | 第 52-55 行 |
| `activity-card` | 不处理，靠 mixin | 第 4 行 |

所以「卡片能不能出图」取决于它被谁喂数据，而不是取决于卡片自己：

- 论坛列表走的是 `pages/forum/mixins/getData.js` 的 `setListData`，它**没有**做任何路径归一；`post-card` 之所以在论坛能显示头像和图片，是因为它自己在 computed 里调了 `fixImgUrl`。
- 首页瀑布流走的是 `postList` mixin，数据已经归一过了；`mini-card` 自己不处理也能正常显示。
- `head-img` 被 `mini-card` 使用（`<JHeadImg :head="info.avatar" width="70" />`），所以它依赖首页 mixin；如果哪天别处直接用它，而不先归一，就会拿到相对路径。

另一处不一致是域名：社区图片拼的是 `baseUrl + prefix`，官网新闻拼的是 `https://www.dobot.cn`。两套图源、两套规则，分别写在两个 mixin 里，`news-card` 完全不知情。

`post-card` 还有一个副作用：`imgList` 是 computed，但它在里面**原地改写**了入参：

```js
imgList() {
  let res = [];
  if (this.info && this.info.postImageList) {
    list.map(item => {
      if (item.imageType == 0) {
        item.imageUrl = fixImgUrl(item.imageUrl)   // 改写 props 里的对象
        res.push(item)
      }
    })
  }
  return res;
}
```

在论坛这条链上，这是唯一的归一；在首页这条链上，归一发生在 `postList` mixin 里，`post-card` 并没有参与。也就是说，同一类字段在首页由数据层处理、在论坛由组件层处理，两套规则并存。它让一个 computed 变成了有写操作的计算，而且改写的是父组件传进来的对象——`post-card` 的 `info` 就是 store 里的帖子对象。

### 2.5 交互链路：点击、收藏、点赞、分享

**点击**：`mini-card` 的根节点 `@click="clickCard"` 抛出 `this.info`，`water-flow` 原样透传，首页 `toPost(val)` 用 `val.postId` 跳详情；`post-card` 抛的是无参的 `onClick`，所以论坛的 `clickPostCard(item)` 是直接闭包捕获循环变量，不依赖事件参数。

**收藏**：`mini-card` 的收藏区是 `@tap.stop="collect"`，抛 `this.info`；`social-box` 的收藏格也是抛 `this.info`。两条路都汇到社交 mixin 的 `changeCollect(val)`：

```js
if (this.checkAuth()) {
  const pendingKey = String(val.postId)
  if (this.socialCollectPending[pendingKey]) return
  this.socialCollectPending[pendingKey] = true
  this.store.changeCollect(val)              // 先乐观更新
  const request = val.isFavorite == 1 ? collectApi(...) : delCollectApi(val.postId)
  // 失败时再 changeCollect 一次回滚 + toast
}
```

`store.changeCollect` 会同时遍历 `postList` 和 `indexPostList`，按 `postId` 翻转 `isFavorite` 并增减 `favoritesCount`（`store/post.js` 第 6-17 行）。所以首页点收藏，论坛列表里的同一篇帖子也会同步变；反过来也一样。

**点赞**：只有 `social-box` 有，链路同上，`pending` 去重键也是 `postId`。

**分享**：`social-box` 里放了两个按钮，用 `token` 是否为 `null` 二选一：

```html
<button class="item-btn" :id="info.postId" v-show="token===null" @tap="toShare">
<button class="item-btn" open-type="share" :id="info.postId" v-show="token!==null">
```

未登录的那个点了走 `toLoginNeedToken()`；已登录的那个是原生 `open-type="share"`，靠 `:id="info.postId"` 让页面的 `onShareAppMessage(e)` 能读到 `e.target.id`：

```js
onShareAppMessage(e) {
  this.store.changeShareNum(e.target.id)
  shareChangePointApi(e.target.id * 1);
}
```

这是一个隐式契约：按钮的 `id` 必须等于 `postId`，页面必须实现 `onShareAppMessage`，否则分享出去的是默认标题，积分也不会加。而 `store.changeShareNum` 累加的 `shareCount`，在 `social-box` 里是被注释掉的——模板两处 `<text class="num">{{info.shareCount}}</text>` 都没有渲染。也就是说分享次数只存在于内存和埋点里，界面上看不到。

**详情页复用**：`pages/post/index.vue` 顶部用 `JPostUserInfo` 渲染作者行，底部用 `JCommentTools`，后者内部又是一个 `size="small"` 的 `JSocialBox`。同一个互动栏在列表里是 36rpx 图标，在详情页底部变成 32rpx。

## 3. 空和失败怎么处理

### 3.1 三处带着事故注释的空值兜底

这一层最有价值的东西，是几段注释里写着的真实故障。

**`mini-card.shortName`（第 80-88 行）**：

```js
// 原代码逻辑反转：if(val) 直接返回 val（永远走到 return），
// else 分支里 val 已 falsy，val.length 会抛 TypeError——
// 瀑布流首个卡片渲染崩溃时，整个 watch(lfHeight/rtHeight) 链断掉，
// 后续所有卡片都不渲染，最终表现"新闻模块消失"。
if (!val) return '';
if (String(val).length > 10) return String(val).substring(0, 10) + '...';
return String(val);
```

这条注释把 2.1 的机制解释得很清楚：卡片渲染异常不只是白一张卡，它会中断测量链，导致后面所有卡片都不出现。用户看到的是「新闻模块消失」，根因是一个空昵称。

**`_postContent`（`mini-card` 第 52-59 行、`post-card` 第 83-88 行）**：同一个问题的另一面。`postContent` 为空时，原来的 `String(raw).replace(...)` 会空指针；现在两个组件都先 `if (!raw) return ''`。`post-card` 的注释直接写了「与 mini-card 同类问题」。

**`activity-card.formatDateRange`（第 38-44 行）**：

```js
// startDate/endDate 为 null/undefined 时，字符串拼接会变成 "null 00:00:00"
// 传给 new Date() 得到 Invalid Date，getMonth()/getDate() 后显示 "NaN/NaN - NaN/NaN"
return `${sd ? this.getShortDate(sd + " 00:00:00") : '—'} - ${ed ? ... : '—'}`;
```

`formatTimeRange` 则借一个固定日期 `'2016-09-09 ' + st` 来构造合法时间，避免只有 `HH:mm:ss` 时被 `new Date()` 判为非法。这两处的兜底是「显示破折号」，不是「重新请求」。

### 3.2 图片为空时，兜底是一张空头像

因为 `fixImgUrl` 的空值分支返回 `EmptyHeadImg`，所以凡走过它的图片字段，空值都会变成一张灰色头像图：

- `post-card` 的三图栅格里，如果某张图 `imageUrl` 是空串，展示出来的是空头像，而不是空白或占位块；
- `videoUrl` 也是 `fixImgUrl(item.imageUrl)`，如果视频地址为空，它会返回一张 jpg 的路径给 `<video>`；
- `post-user-info` 的 `avatar` 为空时同样得到空头像，`head-img` 则用 `v-if="head"` 自己切到 `head-empty.jpg`。

`news-card` 是例外：`coverImg` 直接返回 `''`，没有 `fixImgUrl`，也没有兜底图，`<image :src="">` 就是一块空白。三张图都没有 `@error` 监听，加载失败时界面上什么都不发生。

### 3.3 失败一律静默，数据为空就整块消失

- 瀑布流测量失败：`try/catch` + `console.warn`，界面无提示；
- 新闻请求失败：`catch` 里 `this.newsList = []`，首页的 `v-if="newsList.length > 0"` 让整个「最新动态」段落消失；
- 活动请求失败：`this.activityList = []`，`JActivityList` 的 `v-if` 同理；
- 帖子列表失败：`console.warn("[getPostList] fail", ...)`，保留旧数据，`hideLoading`；
- 收藏/点赞失败：回滚 store 状态 + `uni.showToast({ title: "操作失败，请重试", icon: "none" })`。

首页的七个加载锁（`loadingP`、`loadingS`、`loadingI`、`loadingA`、`loadingU`、`loadingSS`、`loadingN`）都是同一种写法：锁时间戳在 5 秒内就直接 `return`，超时后允许重发。新闻和活动两个 mixin 把这个值抽成了 `LOADING_TIMEOUT_MS`，其余五处直接写 `5000`。注释写的是「避免上次请求卡住锁导致本次跳过，导致首页数据加载不全」。这是上一轮「首页数据加载不全」故障留下的补丁。

### 3.4 没有处理的失败

- **评论图标点不动**。`social-box` 的评论格是 `<view class="item">`，没有 `@tap`，激活图标还写着 `v-show="false"`。用户在详情页点评论图标没有任何反应，只能点输入框。`comment-tools` 甚至给 `JSocialBox` 挂了 `@share="share"`，但 `social-box` 从来不发 `share` 事件（`share()` 方法整段被注释），这个监听是空的。
- **单图预览把事件对象当索引**。`post-card` 第 19-20 行的单图是 `@click.stop="previewImg"`，Vue 会把 `$event` 作为第一个参数传入；`previewImg(current = 0)` 的默认值只在 `undefined` 时生效，所以 `current` 是一个事件对象。多图分支写的是 `previewImg(index)`，是对的。相比之下，详情页的 `previewImg`（`pages/post/index.vue` 第 244-259 行）会先把 `imageType == 0` 的图片抽成 `urls`，再算出 `current`，那才是正确写法。
- **三图上限没有「+N」**。`v-show="index<3"` 只是隐藏了第 4 张之后的节点，没有遮罩告诉用户还有几张，节点本身也还在 DOM 里。
- **`showCard` 用严格等于判断收藏状态**（`post-card` 第 89-95 行）：

  ```js
  showCard() {
    console.log("showCard", this.showSocialTools, this.info.isFavorite)
    if (this.showSocialTools === false && this.info.isFavorite === 0) return false;
    return true;
  }
  ```

  论坛「我的收藏」标签页会把 `showSocialTools` 置为 `false`（`pages/forum/mixins/getData.js` 第 141 行），此时 `isFavorite` 必须是数字 `0` 才会隐藏卡片；如果接口返回字符串 `"0"` 或 `undefined`，卡片就不会隐藏。这个 computed 还在每次重算时打一条 `console.log`，列表滚动、点赞、收藏都会触发。
- **分享按钮的 `token` 契约**：两个按钮靠 `token===null` / `token!==null` 互斥显示。只要 `getToken()` 返回的不是严格 `null`（空串、`undefined`），就一律显示「可分享」按钮，未登录也能拉起转发。
- **用户条的登录态有两个来源**：文案用 `token` prop（默认 `false`），跳转用 `getToken()`。首页 `onLoad` / `onShow` 都会把 `this.token` 同步一次，所以目前一致；但只要哪一处忘了赋值，就会出现「显示未登录、点进去却直接进个人中心」的错位。
- **`getFirstImg()` 每次渲染调两次**（`v-if="getFirstImg()"` 和 `:src="getFirstImg()"`），每次都遍历一遍 `postImageList`。

## 4. 界面为什么要这样排版

**瀑布流的两列**没有用 CSS 的 `column-count`，而是两个 `flex:1` 的容器，靠左右各 12rpx 的内边距拼出 24rpx 中缝：

```scss
.water-flow { display: flex; padding: 24rpx; align-items: flex-start; }
.water-flow .lf,
.water-flow .rt {
  width: 0; flex: 1;
  .item {
    padding: 20rpx;
    background: #fff;
    box-shadow: 0px 2px 8px 0px rgba(0, 0, 0, 0.06);
    margin-bottom: 24rpx;
  }
}
.water-flow .lf { padding: 0 12rpx 0 0; }
.water-flow .rt { padding: 0 0 0 12rpx; }
```

`width:0; flex:1` 是为了让两列严格等宽、不被内容撑开；`align-items: flex-start` 让两列各自向上生长，而不是被拉成等高。卡片本身不直接设圆角，靠白底 + 阴影与 `#FCFCFC` 页面底分层。

**图片高度不定**是瀑布流成立的前提：`mini-card` 的首图用 `mode="widthFix"`，宽度 100%、高度按比例，所以同一列里每张卡高度都不一样。正文用 `.s5r` 截到五行，避免长文把某一列拉得过长；作者行 `width:0; flex:1` 保证长昵称被 `.ellipsis` 截断而不是把收藏数挤出去。

**论坛大卡**的留白更大：`padding: 32rpx 40rpx 40rpx`。三图是 `grid-template-columns: 1fr 1fr 1fr` + `grid-column-gap: 10rpx`，在 750rpx 屏上每格约 216rpx 宽、162rpx 高，接近 4:3；单图用 `aspectFill` 铺满整行。视频单独一块，`@click.stop="false"` 阻止点视频时跳详情。

**互动栏**固定四等分：

```scss
.social-box { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; }
.item-btn { background: #fff !important; border: 0 !important; &::after { border: 0 !important; } }
```

小程序原生 `button` 自带灰底、边框和 `::after` 描边，这三条覆盖是必须的，否则分享格和另外三格视觉不一致。`size=='small'` 时图标从 36rpx 降到 32rpx、间距从 10rpx 降到 6rpx，用于详情页底部那条更窄的栏。

**作者行**是 80rpx 头像、40rpx 圆角、24rpx 右间距，昵称 32rpx/700/#333，时间 24rpx/#999。`.info` 写了 `justify-content: space-between`，但它的高度就是内容高度，所以这条声明没有实际效果；右侧的 `<view class="rt"></view>` 是个空占位，预留给以后可能出现的关注按钮。

**用户条**用 `margin-top: -56rpx` + `z-index: 999` 压在轮播图底部，`lf` / `rt` 按 6:4 分，右侧「个人中心 ›」的箭头用 `mode="heightFix"` 固定 20rpx 高。

**新闻卡**是 200×150rpx 左图 + 右侧三段式（标题两行、摘要两行、日期），日期用 22rpx 的 `#c8c9cc`，比摘要的 `#9aa0ab` 更浅一档。**活动卡**是 264×198rpx 封面 + 三行文字，「查看详情」按钮绝对定位在 `bottom/right: 24rpx`，不占文档流高度，所以卡片高度由封面决定。

整套卡片共用一组视觉 token：主色 `#0047bb`、页面底 `#FCFCFC`、正文 `#494949`、描述灰 `#9aa0ab`、卡片阴影统一 `0px 2px 8px rgba(0,0,0,.06)`。

## 5. 代码怎么落地

### 5.1 调用关系

```
pages/index/index.vue
├── JUserCard      <- mixins/userInfo.js（归一 avatar）
├── JActivityList  <- mixins/activityList.js（归一 coverUrl）-> JActivityCard
├── JNewsCard      <- mixins/newsList.js（拼官网域名）
└── JWaterFlow     <- mixins/postList.js（init/add）-> MiniCard -> JHeadImg

pages/forum/index.vue
└── JPostCard      <- mixins/getData.js（不归一）-> JPostUserInfo + JSocialBox

pages/post/index.vue
├── JPostUserInfo（归一 avatar）
└── JCommentTools -> JSocialBox(size=small)
```

### 5.2 收藏的状态流

`social-box` / `mini-card` 只负责抛事件，真正的状态在 store 里：

```js
function updateCollect(list, val) {
  list.forEach(item => {
    if (item.postId == val.postId) {
      item.isFavorite = item.isFavorite == 0 ? 1 : 0
      if (item.isFavorite == 1) item.favoritesCount++
      else item.favoritesCount--
    }
  })
}
```

`changeCollect` 同时作用于 `postList`（论坛）和 `indexPostList`（首页），所以两个列表天然同步；`changeLike` 同理。这种「按 id 广播」的写法简单有效，代价是每次操作都要全量遍历两个数组，页面分页多了以后是 O(n)。

### 5.3 如果要动这一层，建议按这个顺序

1. **先把图片归一收到一处**。要么所有卡片统一在组件内调 `fixImgUrl`，要么约定「页面/mixin 必须归一，组件不再处理」。现在是两套混用，`post-card` 重复处理、`mini-card` 完全依赖上游，任何新页面接入都会踩一次。
2. **去掉 `imgList` 的写入副作用**。归一到数据层后，`imgList` 只做过滤，不改 `item.imageUrl`。
3. **修单图预览**：`@click.stop="previewImg(0)"`，或改成 `previewImg($event, 0)` 的显式签名。
4. **接上评论入口**，或把评论格从「可点区域」里去掉，避免误导；同时删掉 `comment-tools` 上永远不会触发的 `@share`。
5. **`showCard` 的日志删掉**，判断改成宽松比较（`Number(this.info.isFavorite) === 0`），否则收藏页的隐藏逻辑不可靠。
6. **补 `@error`**：三图栅格和新闻封面都应该有加载失败兜底，现在只有「路径为空」被 `fixImgUrl` 兜住了。
7. **删除 `u-water-flow`**。零引用、功能残缺（不接点击和收藏），留着只会让下一个人以为有两套瀑布流。
8. **测量失败要能续跑**。`render()` 的 `catch` 里除了 `warn`，至少要保证 `next()` 还能被调用一次，否则一次测量异常就会让列表停在半截。

### 5.4 验证

- `npm test`：9 个测试文件、130 项全部通过
- `npm run check`：79 个文件，0 errors / 0 warnings / 0 hints
- `npm run build`：构建成功，索引 74 页、19062 词
- `npm run test:build`：19 项构建冒烟全部通过

文中所有结论均可指回源码：瀑布流调度见 `components/water-flow/index.vue` 第 63-193 行；字段回退见 `components/news-card/index.vue` 第 25-60 行；三段事故注释见 `components/mini-card/index.vue` 第 52-88 行与 `components/activity-card/index.vue` 第 38-49 行；分享 id 契约见 `components/social-box/index.vue` 第 3-12 行与 `pages/forum/index.vue` 第 127-130 行。
