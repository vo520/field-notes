---
title: 社区帖子详情：正文、图片、评论与点赞收藏的一次完整走查
description: 基于 pages/post/index.vue 和它挂载的四个子组件真实源码，拆解帖子详情的双次拉取、乐观点赞与失败回滚、评论树拍平、固定输入栏，以及分享积分回调里会抛异常的 e.target。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 社区, 工程实践]
featured: false
draft: false
project: robot-forum-miniapp
---

论坛列表页只负责「让帖子看起来值得点」。真正把一条帖子完整展开的，是 `pages/post/index.vue`：作者信息、标题、正文、图片或视频、评论区、点赞收藏分享，全部挤在一个页面里。

这个页面只有 289 行，但挂了四个子组件（`post-user-info`、`comment-list`、`comment-tools`、`no-comment`），再加一个共享的 `social-box`。它的复杂度不在渲染，而在「同一个状态有几份副本」：详情对象一份、Pinia 里的列表一份、子组件内部还有一份输入态。下面按真实代码走一遍。

## 1. 用户要完成什么

- 从论坛、首页动态或互动区点进一条帖子，看到作者头像、昵称、发布时间；
- 读标题和正文，正文超过 5 行时点「查看全部内容」展开，再点「收起」；
- 看帖子里的图片，点开大图左右滑动；帖子带视频时直接播放；
- 点赞、收藏，数字立刻变化；
- 把帖子转发给微信好友或群；
- 看评论列表，点某条评论的「回复」，输入框变成「回复@某某」；
- 没有评论时，看到「还没有评论哦」并点「抢首评」直接聚焦输入框；
- 在底部固定输入栏里写评论并发送。

## 2. 页面要怎么走

### 入口：三处跳转，参数只有一个 postId

```js
// pages/forum/index.vue
clickPostCard(item) {
  if (this.checkAuth()) {
    uni.navigateTo({
      url: `/pages/post/index?postId=${item.postId}`,
    })
  }
}
```

另外两处入口在 `pages/index/index.vue` 和 `components/interact-item/index.vue`，拼接的 URL 完全一样，都是 `/pages/post/index?postId=...`。论坛这条路径会先过 `checkAuth()`，未登录先去登录；另外两处没有这层前置判断，靠详情页自己的请求兜底。

### onLoad 拉详情 + 拉评论，onShow 再拉一次详情

```js
onLoad(data) {
  this.postId = data.postId;
  this.store = usePostStore();
  this.getPostDetail();
  this.getCommentList();
},
onShow() {
  this.token = getToken();
  this.getPostDetail();
}
```

`postId` 是直接从 query 里取的字符串，没有 `parseInt` 也没有空值校验。请求时它被拼进路径：`/biz/posts/${postId}`。如果这个页面被以空参数打开，请求会变成 `/biz/posts/undefined`。

`onShow` 里的第二次 `getPostDetail()` 是页面生命周期决定的：首次进入时 `onLoad` 先发起请求，紧接着 `onShow` 触发，此时 `loading` 已经是 `true`，会被锁挡掉；但用户切到后台再回来时，页面会重新拉一次详情并整体替换 `postDetail`。

### 详情请求：一个布尔锁 + 一次文本预处理

```js
async getPostDetail() {
  if (!this.loading) {
    this.loading = true;
    uni.showLoading({ title: "加载中" })
    try {
      const res = await postDetailApi(this.postId)
      let data = (res && res.data) || {};
      data.postContent = (data.postContent || "").replace(/\n/g, '<br/>')
      this.postDetail = data;
      this.store.changeCommentNum(data)
      this.store.setShareCount(data)
      let list = data.postImageList || []
      this.imgList = list.map(item => {
        item.imageUrl = fixImgUrl(item.imageUrl)
        return item
      })
    } catch (e) {
      console.warn("[post.getPostDetail] fail", e && e.message)
    } finally {
      this.loading = false;
      uni.hideLoading()
    }
  }
}
```

三件事值得记：

1. 接口是 `get('/biz/posts/${postId}', {}, false)`，第三个参数 `false` 只表示「不强制登录」，并不等于「不带 token」。请求拦截器里只要 storage 有 token 就会写入 `Authorization`，所以已登录用户拿到的详情才带 `isLike`、`isFavorite` 这些个人状态字段。
2. 正文只做了一件事：把 `\n` 换成 `<br/>`，然后整串交给 `rich-text` 的 `nodes`。没有 HTML 转义，也没有过滤，后端返回什么就渲染什么。
3. 拉完详情顺手把 `commentCount`、`shareCount` 同步回 Pinia 里的两份列表（`postList` 和 `indexPostList`），保证返回列表页时数字不是旧的。

### 正文展开：一个布尔值控制 5 行截断

```html
<rich-text class="pt" :class="{s5r:!showAllContent}" :nodes="postDetail.postContent">
  {{postDetail.postContent}}
</rich-text>
<text class="read-more" @click="showAll">{{textShowAll}}</text>
```

`s5r` 是全局样式里的 5 行 clamp：

```scss
.s5r {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  text-overflow: ellipsis;
  overflow: hidden;
}
```

`showAll()` 只是翻转 `showAllContent`，按钮文案由计算属性给出：`收起` / `查看全部内容`。

### 图片与视频：同一个数组，按 imageType 分流

```html
<template v-for="(item,index) in imgList">
  <view class="mb10" :key="`${index}`" v-if="item.imageType==0">
    <image :src="item.imageUrl" mode="widthFix" class="if" @tap="previewImg(index)"></image>
  </view>
  <view class="vb mb10" :key="`${index}`" v-if="item.imageType==1">
    <video :src="item.imageUrl" controls class="v"></video>
  </view>
</template>
```

`imgList` 里图片和视频混在一起，`imageType == 0` 渲染 `image`，`== 1` 渲染 `video`。两者共用同一个 `index` 作 key，因为同一时刻只会命中一个分支。

图片预览要先在「图片子集」里换算下标，否则点第 2 张图会打开视频或错位：

```js
previewImg(val = 0) {
  let urls = []
  let current = 0
  this.imgList.forEach((item, index) => {
    if (item.imageType == 0) {
      if (index == val) {
        current = urls.length
      }
      urls.push(item.imageUrl)
    }
  })
  uni.previewImage({ urls, current })
}
```

`current` 记录的是「这是第几张图片」，不是「这是数组第几项」，这个换算是这段代码里少数写得完全正确的地方。

### 评论：拉全量，然后把树拍平

```js
async getCommentList() {
  try {
    const res = await commentListApi(this.postId);
    console.log('commentListApi', res)
    const list = res.rows || res.data || [];
    list.forEach(item => {
      if (item.childComments) {
        item.childComments = innerListToOut(item.childComments, "childComments")
      }
    })
    console.log("list", list)
    this.commentList = list;
  } catch (e) {
    console.warn("[post.getCommentList] fail", e && e.message)
  }
}
```

`commentListApi` 是 `get('/biz/comments/${postId}', {}, false)`，没有分页参数，一次拿整棵树。

`innerListToOut` 在 `tools/util.js` 里，做的事是把嵌套的 `childComments` 递归拍平成一个数组，同时给每一项打上 `isOut` 标记：

```js
export const innerListToOut = (list, key, out) => {
  let res = [];
  list.map(item => {
    item.isOut = out === false ? false : true;
    res.push(item)
    if (item[key]) {
      item[key].map(inner => {
        res.push(inner)
        if (inner[key]) {
          let arr = innerListToOut(inner[key], key, false)
          arr.map(a => { res.push(a) })
        }
      })
    }
  })
  return res;
}
```

所以 `commentList` 的结构是「一级评论数组 + 每条一级评论下的二级扁平数组」。三级及更深的回复不会继续缩进，只会以「昵称▶被回复人」的形式出现在同一层：

```js
nickName() {
  if (this.info.parentNickName && !this.info.isOut) {
    return `${this.info.nickName}▶${this.info.parentNickName}`
  }
  return `${this.info.nickName}`
}
```

缩进只有一级：`comment-list` 给子评论统一加 `padding-left: 100rpx`。

### 回复与发送：事件从组件冒到页面，再从页面 ref 回组件

点击链有三跳：

```js
// comment-item
toReply() { this.$emit("toReply", this.info) }
// comment-list
toReply(val) { this.$emit("toReply", val) }
// page
toReply(val) { this.$refs["commentTools"].toReply(val) }
```

`comment-tools.toReply` 记下被回复的人，把 placeholder 改成「回复@某某」，并置 `focus = true` 拉起键盘。真正的发送在组件内部完成校验和清空：

```js
toComment() {
  if (this.inputValue == "") {
    this.$refs.uToastRef.show({ type: 'default', message: "评论内容不能为空", position: "bottom" })
  } else {
    uni.hideKeyboard()
    this.$emit("comment", this.inputValue, this.replyInfo)
    this.inputValue = "";
  }
}
```

页面收到 `comment` 事件后组装请求：

```js
async confirmComment(val, parentObj) {
  uni.showLoading({ title: "" })
  let data = { postId: this.postId * 1, content: val }
  if (parentObj) {
    data.parentCommentId = parentObj.commentId * 1
  }
  try {
    await addCommentApi(data)
    await this.getPostDetail();
    await this.getCommentList();
    uni.showToast({ title: "评论成功" })
  } catch (e) {
    console.warn("[post.confirmComment] fail", e && e.message)
  } finally {
    uni.hideLoading();
  }
}
```

评论成功后重新拉详情再拉评论，所以评论数、列表都来自服务端，不做本地插入。这避免了「本地插入的评论缺字段」，代价是两次串行请求。

### 点赞与收藏：先改本地，再发请求，失败再改回来

```js
changeLike(val) {
  if (this.likePending) return
  this.likePending = true
  this.store.changeLike(val)
  this.postDetail.isLike = val.isLike == 0 ? 1 : 0
  if (this.postDetail.isLike == 1) {
    this.postDetail.likeCount++;
  } else {
    this.postDetail.likeCount--;
  }
  const request = this.postDetail.isLike == 1 ? likeApi({ postId: val.postId }) : delLikeApi({ postId: val.postId })
  uni.showToast({ title: this.postDetail.isLike == 1 ? "点赞成功！" : "取消点赞", icon: "none" })
  request.catch((e) => {
    this.store.changeLike(val)
    this.postDetail.isLike = this.postDetail.isLike == 0 ? 1 : 0
    if (this.postDetail.isLike == 1) {
      this.postDetail.likeCount++;
    } else {
      this.postDetail.likeCount--;
    }
    uni.showToast({ title: "操作失败，请重试", icon: "none" })
  }).finally(() => {
    this.likePending = false
  })
}
```

这里有一处容易被忽略的事实：详情页里的 `social-box` 接收的是 `:info="postDetail"`，所以 `val` 就是 `this.postDetail` 本身。`store.changeLike(val)` 改的是 Pinia 列表里的副本，`this.postDetail.isLike = ...` 改的是详情对象，两者是两套独立的乐观更新。失败回滚时两套也各自回滚一次。

`likePending` / `collectPending` 只防连点，不防「请求还没回来就再点」，因为第二次点击会被直接 return。

### 分享：两条路径，一个回调

`social-box` 的分享按钮按 token 分成两个版本：

```html
<button class="item-btn" :id="info.postId" v-show="token===null" @tap="toShare">
  ...
</button>
<button class="item-btn" open-type="share" :id="info.postId" v-show="token!==null">
  ...
</button>
```

未登录时点击只是 `toLoginNeedToken()`；已登录时用原生 `open-type="share"` 调起转发。转发回调写在页面里：

```js
onShareAppMessage(e) {
  this.store.changeShareNum(e.target.id)
  shareChangePointApi(e.target.id * 1);
}
```

## 3. 空和失败怎么处理

这个页面的失败处理几乎都是「吞掉异常，保持安静」：

- **详情失败**：`catch` 只打 `console.warn`，`postDetail` 仍是 `{}`。页面会渲染出一个空头像、空昵称、空标题、空正文，用户看到的是「一张什么都没写的白纸」，没有错误提示，也没有重试按钮。
- **评论失败**：同样只 `console.warn`。而评论区的空态是 `v-show="commentList.length==0"`，所以请求失败与「真的没有评论」在界面上完全一样，都会显示「还没有评论哦 + 抢首评」。
- **空态误判**：`v-show` 在请求还没返回时就成立，所以首屏会先闪一下「抢首评」，数据回来后如果真有评论才消失。
- **正文为空**：`(data.postContent || "")` 保证 `replace` 不会空指针，`rich-text` 渲染空串；但「查看全部内容」按钮不看内容长度，永远在。
- **头像为空**：`fixImgUrl('')` 返回内置的 `EmptyHeadImg`，不会出现裂图。
- **图片为空**：`imgList` 为空数组，模板不渲染，不留占位。
- **点赞失败**：本地回滚 + 「操作失败，请重试」。问题是「点赞成功！」在发请求之前就已经弹了，用户会先看到成功再看到失败。
- **收藏失败**：同上。另外取消收藏调的是 `delCollectApi(val.postId)`，接口是 `del('/biz/favorites/removeById/${id}')`——路径名是 `removeById`，传进去的是 `postId`。`api/index.js` 里已经留了注释承认这一点：「若后端严格校验 favoritesId，需后端新增 removeByPostId」。也就是说这条链路依赖后端宽容。
- **评论发送失败**：输入框在 emit 之前就已经清空（`this.inputValue = ""`），失败也不会恢复，用户刚打的字直接丢了。
- **分享**：`shareChangePointApi` 没有 `catch`，积分上报失败完全静默。而 `onShareAppMessage` 读 `e.target.id` 时，如果用户是从右上角胶囊菜单转发，微信回调里的 `e.target` 是 `undefined`，这一行会直接抛 `TypeError`，本次分享的积分上报随之中断。
- **重复分享**：每转发一次就上报一次积分，前端没有去重或上限判断。

## 4. 界面为什么要这样排版

**顶部作者信息**用 `post-user-info`：80rpx 圆形头像、右侧昵称 32rpx 加粗 `#333`、发布时间 24rpx `#999`，两者用 `justify-content: space-between` 上下撑开，整体 `margin-bottom: 24rpx`。这套尺寸和论坛卡片完全一致，列表点进详情时视觉不跳。

**标题与正文**用全局排版类：标题 `.ptl`（32rpx / 48rpx 行高 / 700），正文 `.pt`（28rpx / 44rpx 行高 / `#666`）。正文比标题更淡，是因为详情页的阅读重心在「谁发的、说了什么」，标题只需要承担定位。

**正文折叠**用 `-webkit-line-clamp: 5`。选 5 行是移动端信息密度和页面长度的折中：短帖不会出现展开按钮（但代码没做这个判断），长帖的首屏也不会被一段文字全部占满。展开链接是 28rpx 的蓝色文字，`hover` 时用 `lighten(#1677FF, 20%)` 变浅而不是变深，避免在深色文字旁边显得更重。

**图片区**是单列铺满、`mode="widthFix"` 保持原始比例，外边距 `mb10`。不做九宫格是因为详情页的图片需要看清内容，缩略图交给列表页去做。视频单独用 `controls` 原生控件，不和图片混排。

**评论空态**是居中的两行：上面 24rpx 灰色的「- 还没有评论哦 -」，下面一个 152×60rpx 的浅灰胶囊按钮「抢首评」。按钮不用品牌蓝，是因为空态不是主行动，抢首评只是给愿意说话的人一个入口。

**底部输入栏**是整页最复杂的布局，`position: fixed; bottom: 0`，左右各占 `width: 0; flex: 1`：

```scss
.comment-tools {
  display: flex;
  padding: 20rpx 30rpx 40rpx;
  position: fixed;
  bottom: 0;
  z-index: 999;
  .lf { width: 0; flex: 1; }
  .rt { width: 0; flex: 1; padding-left: 20rpx; }
}
.send-box {
  .lf { flex: 9; }
  .rt { flex: 1; }
}
```

未聚焦时左半边是输入框、右半边是分享/收藏/点赞/评论四宫格；一旦聚焦，`send-box` 把比例改成 9:1，四宫格让位给一个发送图标。输入框本身是 60rpx 高的浅灰圆角条（`#F3F3F3`，圆角 30rpx），左侧留 68rpx 给铅笔图标，`auto-height` 让它随内容长高，`hold-keyboard` 保证点发送时键盘不闪。

页面底部还放了一个 120rpx 的空 `view.safe-area`，用来给固定输入栏留出滚动空间，不然正文最后一段会被输入栏永久遮住。

图标尺寸分两档：默认 36rpx，`size="small"` 时 32rpx；数字 24rpx `#494949`，始终跟在图标右侧 10rpx（小号 6rpx）。

## 5. 代码怎么落地

把上面的走查折成可复用的几条：

**1）请求层的 `auth=false` 不等于匿名。** `postDetailApi` 和 `commentListApi` 都传了 `false`，但 `tools/request.js` 的拦截器是 `if (config.custom.auth || token)`——只要 storage 里有 token 就会带 `Authorization`。所以详情页能根据登录态返回 `isLike` / `isFavorite`，而论坛列表即使不传 `auth` 也能正确渲染。

**2）一个动作，两份状态。** 点赞和收藏都同时改 `store.postList` / `store.indexPostList` 和详情对象。store 里的比较是宽松相等（`item.postId == val.postId`），所以字符串 id 和数字 id 都能命中；而 `changeShareNum` 特意写了 `postId * 1` 再比较，是在补 `e.target.id` 是字符串这个坑。

**3）评论树只拍平一层。** `innerListToOut` 递归把所有后代塞进同一个数组，但 UI 只给一层缩进。超过三级的回复，靠 `nickName▶parentNickName` 说明「在回谁」，不靠缩进表达层级。这是数据结构向渲染做的妥协：拍平后 `v-for` 只有两层，不需要递归组件。

**4）空态和错误态没有分开。** 全页没有一个 `error` 字段。`commentList.length == 0` 同时代表「加载中」「加载失败」「真的没有」。要修的话最小改动是加一个 `commentLoaded` 布尔，空态条件改成 `commentLoaded && commentList.length == 0`。

**5）固定输入栏少了安全区。** 页面补了 120rpx 占位，但 `.comment-tools` 自身没有 `padding-bottom: env(safe-area-inset-bottom)`。在有 Home Indicator 的机型上，输入框会贴着底部横条，点击区域和系统手势区重叠。

**6）几处确定的缺陷清单**（都可在源码里直接定位）：

- `onShareAppMessage` 读 `e.target.id`，胶囊菜单转发时 `e.target` 为 `undefined`，抛 `TypeError`，积分上报中断；同时没有 `return { title, path, imageUrl }`，分享卡片标题固定是页面标题「帖子」。
- 点赞/收藏的成功 toast 在请求发出前就弹出，失败时会连续出现「成功」和「失败」两条提示。
- 取消收藏把 `postId` 当作 `favoritesId` 传给 `/biz/favorites/removeById/{id}`，依赖后端宽容。
- 评论发送先清空输入再发请求，失败后内容不可恢复。
- `confirmComment` 的 loading 与 `getPostDetail` 内部的 loading 嵌套：内层 `finally` 会提前 `hideLoading`，成功 toast 之后外层 `finally` 再 `hideLoading` 一次，部分平台上会把刚弹出的 toast 一起关掉。
- `getCommentList` 里留着两行 `console.log`，生产环境会把整棵评论树打进控制台。
- `<JLocation />` 被注释掉，`location` 组件和 `postDetail` 里的地址字段都没有被使用，属于死代码。
- 回复某条评论后如果发送失败，`replyInfo` 不会被清理，下一条评论仍会带上 `parentCommentId`。
- 正文用 `rich-text` 直接渲染后端字符串，除了 `\n → <br/>` 之外没有任何清洗。
- 评论没有分页，热度高的帖子会一次性把全部评论和回复拉下来。

这些不是「设计取舍」，而是能在真机上复现的行为。写清楚它们，比把页面描述成「优雅的社区详情」更有用。
