---
title: 机器人应用社区：帖子流、互动与发布的真实实现
description: 基于 uni-app 小程序论坛模块的真实代码，拆解帖子列表筛选、分页、详情阅读、点赞收藏的乐观更新、评论回复与发帖上传。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 论坛, 工程实践]
featured: false
draft: false
project: robot-forum-miniapp
---

「机器人应用」是小程序的 tabBar 页面，实际代码在 `pages/forum`，帖子详情在 `pages/post`。列表并不是一个单独的大文件，而是由 `getData / publish / social / dot / auth` 五个 mixin 拆开：数据、发布、互动、红点、登录校验各管一段。

下面还是按五段讲：用户要完成什么、页面怎么走、空和失败怎么处理、界面为什么这样排、代码怎么落地。

## 1. 用户要完成什么

用户来到「机器人应用」，通常只做四件事：

1. 逛帖子。可以按「所有帖子 / 热门 / 动态标签 / 我的帖子 / 我的收藏」筛选，也可以按标题搜索。
2. 看详情。点卡片进入帖子页，看正文、图片、视频、评论。
3. 互动。点赞、收藏、评论、回复、分享；这些动作都要求已登录且昵称已完善。
4. 发帖。填写标题、正文，最多上传 4 个图片或视频，选一个标签后提交；提交成功只提示「已发布，待审核」，不会立刻出现在列表里。

从「我的」页面进来时，会带一个 `tabName` 本地缓存：`post` 直达「我的帖子」，`collect` 直达「我的收藏」。

## 2. 页面要怎么走

| 页面 | 作用 |
| --- | --- |
| `pages/forum/index` | tabBar「机器人应用」，帖子流与发布入口 |
| `pages/post/index` | 帖子详情、评论、点赞收藏、分享 |

### 列表页的启动顺序

`onLoad` 只做四件事：初始化深链 tab、拿到 Pinia store、拉用户信息、初始化数据和标签。

`onShow` 再补三件事：刷新 token、检查热门红点、重新拉用户信息；然后看深链 tab 是否变化。变了就整页重拉，没变且列表为空才补一次 `initList()`。`onHide` 会删掉 `tabName`，避免下次从普通入口进来还停在上次的「我的收藏」。

### 切 tab 和搜索都会重置分页

切标签、搜索都先把 `pageNum` 拉回 1、`loadAll` 置 false，再 `pageScrollTo({ scrollTop: 0 })` 回到顶部，最后请求列表。标签在加载中会被禁用，避免连续点击把两页数据拼串。

### 分页靠 pageSize 和 total 双条件收口

每页 10 条。`onReachBottom` 时如果还没加载完、也不在请求中，就把 `pageNum++` 再拉一页。结束条件有两个：本地列表长度等于后端 `total`，或者本次返回行数小于 `pageSize`。后者能兜住后端 total 不准的情况。

### 详情页：进入拉一次，回到前台再拉一次

`onLoad` 用 `postId` 拉详情和评论；`onShow` 再拉一次详情，保证从别的页面返回时点赞数、收藏数、评论数是最新的。详情请求有 `loading` 锁，`onLoad` 和 `onShow` 挨得很近时不会发两次。

正文里的换行在详情页被替换成 `<br/>`，再用 `rich-text` 渲染。图片按 `widthFix` 铺满内容宽度，视频用原生 `video` 播放；只有 `imageType == 0` 的图片会进入预览列表。

### 评论与回复走同一条提交链路

底部评论条聚焦后，右侧的点赞/收藏图标会切换成发送按钮。点发送时：

- 没有内容：底部 toast「评论内容不能为空」；
- 有内容：先 `hideKeyboard()`，把内容和 `replyInfo` 一起 emit 给详情页；
- 详情页拼 `{ postId, content, parentCommentId? }`，调用 `addCommentApi`；
- 成功后重新拉详情和评论列表，评论数通过 store 同步回列表页。

点某条评论的「回复」，输入框占位符会变成「回复@昵称」，提交时带上 `parentCommentId`。评论列表把二级回复用 `innerListToOut` 拍平后挂在 `childComments` 下，渲染时统一缩进 100rpx。

### 发帖：先上传，再发布

右下角的固定按钮打开底部弹层。选媒体时，Windows 走 `uni.chooseVideo`，其他平台走 `uni.chooseMedia`，一次选 1 个，视频最长 30 秒，最多保留 4 个。

每选一个文件就立刻调用 `uploadApi` 上传，成功后才推进 `uploadList`，同时按文件后缀标记 `imageType`（0 图片、1 视频）。上传失败会把刚推进 `fileList` 的那一项弹掉，保证「界面上看到的媒体」和「真正能提交的媒体」一致。

点「发 布」时只校验标题和正文非空，然后 emit 给列表页的 `publish` mixin。mixin 调 `addPostApi`，成功提示「已发布，待审核」，清空弹层；失败用 `friendlyError` 把后端信息透出来。

### 点赞和收藏是乐观更新

列表页和详情页都是先改本地状态，再发请求：

- 列表页用 `socialLikePending / socialCollectPending` 按 `postId` 加锁，详情页用 `likePending / collectPending` 布尔锁；
- 先调 `store.changeLike()`，它会同时更新 `postList` 和首页的 `indexPostList`；
- 再根据更新后的 `isLike / isFavorite` 决定调 `likeApi` 还是 `delLikeApi`；
- 请求失败时把状态再翻回去，并提示「操作失败，请重试」。

### 分享

已登录时，分享按钮是原生 `open-type="share"`；未登录时点击只提示「当前操作需要登录」。`onShareAppMessage` 里会本地 `shareCount++`，并调用 `shareChangePointApi` 记录分享积分。

## 3. 空和失败怎么处理

### 列表为空

帖子列表没有单独的插画空态。请求成功但结果为空时，`setListData` 会因为 `rows.length < pageSize` 把 `loadAll` 置 true，页面直接显示 `JNoMore`。这是当前实现的真实表现。

「我的帖子 / 我的收藏」在未登录时也不弹登录框，而是走 `setEmpty()`：清空 store、`loadAll = true`，用户看到的是空列表加「没有更多」。真正需要登录的动作（点赞、收藏、评论、发帖、进详情）才会弹 `checkAuth` 的 modal。

### 列表请求失败

`getList` 的 catch 只做两件事：`stopLoading()` 和 `loadAll = true`，然后 console.warn。页面不会弹错误 toast，而是直接落到「没有更多」。此时上拉不会自动重试，因为 `loadAll` 已经置位；用户下拉刷新会走 `initList()` 重新把 `loadAll` 置回 false。标签接口失败同理，`tags` 保持空数组，顶部仍然有「所有帖子 / 热门 / 我的帖子 / 我的收藏」四个固定项。

### 登录与资料校验

`checkAuth()` 的判断分两层：

- 没有 token：modal 文案「当前操作需要登录」，确认按钮「去登录」；
- 有 token 但没有 `nickName`：文案「当前操作需要完善个人信息」，确认按钮「去完善」。

两个按钮分别跳 `pages/login/index` 和 `pages/register/index`，按钮文案都是 3 个字。

### 上传失败

上传接口返回非 200，或者请求直接 reject，都会把 `fileList` 最后一项弹掉，并用 `friendlyError` 给出原因。图片/视频在 `uploadList` 里保留的是服务端返回的 `imageUrl`，不是本地临时路径，所以发布时不会出现「本地路径提交到后端」的问题。

### 发布失败

`addPostApi` 失败时停止 loading，用后端 `message` 或「发布失败，请稍后重试」提示，弹层不关闭，用户填的标题、正文和已上传媒体都还在，可以直接重试。

### 互动失败

点赞、收藏失败都会回滚本地状态，包括列表页和详情页两份计数。因为 store 同时更新 `postList` 与 `indexPostList`，首页的帖子卡片也会跟着回滚，不会出现「列表里取消了、首页还亮着」的错位。

### 详情与评论失败

详情请求失败只 console.warn，页面保留上一次成功的数据；首次进入失败时是一个空壳，但不会白屏。

评论提交失败同样只 console.warn，不弹错误提示，评论列表也不变。这是当前实现的一个粗糙点：用户点了发送，输入框已清空，但评论没成功时没有明确反馈。

### 评论为空

评论区为空时显示「- 还没有评论哦 -」和「抢首评」按钮。点「抢首评」不是发一条空评论，而是让底部输入框聚焦，把操作权交回用户。

## 4. 界面为什么这样排版

### 搜索和标签固定在顶部

搜索框和标签放在 `up-sticky` 里，滚动帖子流时始终可见。标签顺序是固定的：所有帖子、热门、动态标签、我的帖子、我的收藏。

- 动态标签来自 `getTagListApi()`，只保留 `visible == 1` 的项；
- 标签超过 1 个就开启横向滚动；
- 激活项用 `#0047bb`、28rpx 加粗，底部 6rpx 同色横线；横线宽度按「字数 × 28rpx」算，不写死；
- 「热门」后面的红点是 `#FF5500`，用 `translateY(-14rpx)` 抬到文字右上角。

红点的判断逻辑是「线上热帖 ID 和本地 `hotIds` 做差集」，有新增才亮，并把新 ID 合并进本地缓存。当前实现没有在点击「热门」时清除红点，所以它表示「历史上出现过未读热帖」，而不是「本次有新热帖」。

### 帖子卡片按阅读顺序排

卡片从上到下是：作者头像/昵称/发布时间 → 标题 → 正文 → 图片/视频 → 互动栏。

- 正文用 `rich-text` 渲染，外层限制 5 行，超出省略；
- 图片 1 张时用大图，多张时三列网格，每格 162rpx，只展示前 3 张；
- 视频单独占一行，原生控件播放；
- 互动栏四等分：分享、收藏、点赞、评论；图标 36rpx，收藏/点赞/评论显示 24rpx 的数字，分享不显示数字。

卡片内边距是 `32rpx 40rpx 40rpx`，白底；论坛页本身没有单独设背景色，沿用 `pages.json` 里的全局底色 `#F8F8F8`。列表项之间没有额外分割线，靠留白和白底卡片区分。

### 发布按钮固定右下

发布入口是 102rpx 的悬浮图标，`right: 32rpx`、`bottom: 400rpx`。这个位置在 tabBar 之上、内容右下角，不挡帖子正文，也不和底部 tabBar 重叠。

发布弹层从底部升起，媒体区是两列 280rpx 的方格，最多 4 个；标题输入框 `maxlength=200`，正文 `textarea` 自动增高、`maxlength=2000`；标签选择放在正文下方，最后才是「发 布」主按钮。

### 详情页先读正文，再进评论

详情页内边距 `32rpx 40rpx`，白底。正文默认 5 行，点「查看全部内容」展开，按钮文字变「收起」，颜色 `#1677FF`。正文下面才是图片和视频，再往下是分割线、评论空态、评论列表。

底部评论条是 fixed 定位，页面底部留了 120rpx 的 `.safe-area`，最后一条评论不会被输入框压住。评论条未聚焦时左右各占一半：左边输入框，右边四个互动图标；聚焦后切成 9:1，右边只留发送按钮，把宽度让给输入。

输入框是 60rpx 高的灰色胶囊（`#F3F3F3`，圆角 30rpx），左侧 28rpx 编辑图标，占位符默认「说点什么...」。

### 评论列表用两级结构

一级评论头像 80rpx，二级回复 56rpx，整体再缩进 100rpx。昵称、内容、时间、「回复」在同一行内排布；时间显示规则是：今天显示 `HH:mm`，本月显示 `MM-DD`，更早显示 `YYYY-MM-DD`。

## 5. 代码怎么落地

### 列表参数只有一份，切 tab 时重置

`getData.js` 把搜索条件和分页分开存，每次请求前先清空互斥字段，再按当前 tab 赋值：

```js
this.searchData.popularPost = "";
this.searchData.tag = "";
this.searchData.userId = "";
this.searchData.isFavorite = "";

if (this.tabName == "热门") this.searchData.popularPost = 1;
else if (this.tabName == "我的帖子") this.searchData.userId = this.userInfo.userId;
else if (this.tabName == "我的收藏") this.searchData.isFavorite = 1;
else if (this.tabName != "所有帖子" && this.tabName) this.searchData.tag = this.tabName;
```

「我的收藏」没有走 `postListApi`，而是单独调 `collectListApi()`，并把返回项的 `author` 映射成 `nickName` 供卡片复用。这个 tab 还会把 `showSocialTools` 置 false，卡片上不再显示互动栏。

### 分页收口

```js
setListData(res, list) {
  if (this.queryParams.pageNum == 1) this.store.setPostList(list);
  else this.store.pushPostList(list);

  if (this.postList.length == res.total || res.rows.length < this.queryParams.pageSize) {
    this.loadAll = true;
  }
}
```

`postList` 是 computed，读的是 store，所以判断发生在写入之后，不会少算当前页。

### 上传失败回滚

```js
const resUpload = await uploadApi(filePath);
if (resUpload && resUpload.code == 200) {
  this.uploadList.push({
    imageName: resUpload.newFileName,
    imageType: isVideoFileBySuffix(resUpload.url) ? 1 : 0,
    imageUrl: resUpload.url
  });
} else {
  this.fileList.pop();
  uni.showToast({ icon: "none", title: friendlyError(resUpload, "上传失败") });
}
```

`fileList` 和 `uploadList` 必须同步删，否则用户删掉一个媒体后，下一次上传取到的 `lastIndex` 会对不上。

### 乐观点赞

```js
if (!this.checkAuth()) return;
this.socialLikePending[String(val.postId)] = true;
this.store.changeLike(val);
const request = val.isLike == 1
  ? likeApi({ postId: val.postId })
  : delLikeApi({ postId: val.postId });

request.catch(() => {
  this.store.changeLike(val);
  uni.showToast({ title: "操作失败，请重试", icon: "none" });
}).finally(() => {
  delete this.socialLikePending[String(val.postId)];
});
```

store 里同时遍历 `postList` 和 `indexPostList`，按 `postId` 翻转 `isLike` 并增减 `likeCount`。收藏同理，只是字段换成 `isFavorite / favoritesCount`。

### 评论后同步计数

```js
await addCommentApi({ postId, content, parentCommentId });
await this.getPostDetail();
await this.getCommentList();
```

`getPostDetail()` 拿到最新 `commentCount` 后会调 `store.changeCommentNum(data)`，列表页不需要重新请求，卡片上的评论数就会更新。

### 接口清单

| 动作 | 接口 |
| --- | --- |
| 帖子列表 | `POST /biz/posts/list` |
| 帖子详情 | `GET /biz/posts/{postId}` |
| 发帖 | `POST /biz/posts/add` |
| 评论列表 | `GET /biz/comments/{postId}` |
| 新增评论 | `POST /biz/comments/add` |
| 点赞 / 取消 | `POST /biz/like/add` / `POST /biz/like/unlike` |
| 收藏 / 取消 | `POST /biz/favorites/add` / `DELETE /biz/favorites/removeById/{id}` |
| 我的收藏 | `POST /biz/favorites/list` |
| 标签 | `GET /biz/config/key/tag` |
| 上传 | `POST /common/upload` |

---

这个模块的关键不在页面数量，而在状态一致性：同一篇帖子会同时出现在列表、首页和详情页，点赞数、收藏数、评论数必须一起变。代码用 Pinia 做单一数据源、用 pending 锁防连点、用失败回滚兜底，页面只负责展示和触发。把这三件事分开，帖子流、详情和互动才能各自简单。
