---
title: 发帖模块：底部弹层里的图片上传、标签选择与发布链路
description: 基于 components/publish 与 forum 的 publish mixin 真实源码，拆解发帖弹层的媒体选择与上传、fileList 与 uploadList 的双数组同步、标签多选的 props 直改，以及发布成功后列表不刷新、上传未完成也能提交这些真实缺口。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 社区, 上传]
chapter: community
cover: /images/chapters/community.svg
order: 3
level: practice
featured: false
draft: false
project: robot-forum-miniapp
---

帖子详情负责「读」，发帖负责「写」。写比读麻烦：要选媒体、等上传、填标题正文、选标签，最后一次性提交。整个发帖模块只有一个组件 `components/publish/index.vue`（320 行）加一个 24 行的 mixin，但状态不少——`fileList` 存原始临时文件，`uploadList` 存上传成功后的服务端结果，两个数组要按顺序对齐。

下面按真实代码把这条链路走完。

## 1. 用户要完成什么

- 在论坛页点右下角的悬浮按钮，从底部弹出发帖面板；
- 最多添加 4 张图片或视频，能预览、能删掉某一项；
- 填标题（最多 200 字）和正文（最多 2000 字）；
- 从标签列表里选一个或多个标签，选中的胶囊变成实心黄色；
- 点「发 布」，等待提交，看到「已发布，待审核」；
- 发布失败时留在面板里，内容不丢，可以改完再发。

## 2. 页面要怎么走

### 入口：先过登录 + 资料两道闸

论坛页的悬浮按钮只是一个图片，点击后冒泡到页面：

```js
// pages/forum/index.vue
toPublishPost() {
  if (this.checkAuth()) {
    this.$refs.publish.showPop();
  }
}
```

`checkAuth` 在 `mixins/auth.js` 里做了两件事：

```js
checkAuth() {
  if (getToken()) {
    if (this.userInfo.nickName) {
      return true;
    } else {
      this.modalInfo.content = "当前操作需要完善个人信息"
      this.modalInfo.confirmText = "去完善"
      this.modalShow = true;
    }
  } else {
    this.modalInfo.content = "当前操作需要登录"
    this.modalInfo.confirmText = "去登录"
    this.modalShow = true;
  }
  return false;
}
```

有 token 但 `nickName` 为空，说明只完成了静默登录，还没填资料，会被引导到 `pages/register/index`。两个条件都满足才允许打开面板。

### 打开：底部 popup，不是新页面

```html
<up-popup v-model:show="show" mode="bottom" closeable>
```

`showPop()` 只是把 `show` 置为 `true`。发帖不是独立页面，所以路由栈不变，返回键不会关面板，只能点右上角关闭或点遮罩。面板内的 `data`（标题、正文、媒体）在关闭后仍然保留，等于一个隐式草稿；只有发布成功才会清空。

### 媒体：一次选一个，最多四个

```html
<view class="media-box">
  <view class="item" v-for="(item,index) in uploadList">
    <image v-if="checkImg(item)" :src="getImgPath(item)" mode="aspectFit" class="img" @tap="previewImg(item)"></image>
    <video v-else :src="getVideoPath(item)" class="video"></video>
    <view class="icon-box" @tap.stop="delImg(index)">
      <up-icon name="close-circle-fill" size="60rpx" color="#C70038" :index="index"></up-icon>
    </view>
  </view>
  <view class="item btn fc" @click="chooseMedia" v-show="uploadList.length<4">
    <image :src="addIcon" mode="aspectFit" class="add-icon"></image>
  </view>
</view>
```

「加号」的显示条件是 `uploadList.length < 4`，注意数的是上传成功的列表，不是 `fileList`。所以上传进行中时，加号仍然在，用户可以继续加第 2、3 个文件。

选媒体分两个平台分支：

```js
chooseMedia() {
  if (/windows/.test(this.platform)) {
    uni.chooseVideo({
      success: (res) => {
        this.fileList.push(res)
        this._handleUpload()
      }
    })
  } else {
    uni.chooseMedia({
      count: 1,
      mediaType: ['image', 'video'],
      maxDuration: 30,
      sourceType: ['album', 'camera'],
      success: (res) => {
        res.tempFiles.forEach(item => {
          this.fileList.push(item)
        })
        this._handleUpload()
      },
      fail: () => {
        uni.showToast({ icon: "none", title: "选择失败，请重试" })
      }
    })
  }
}
```

`count: 1` 说明设计上是「一次选一个」，但 `res.tempFiles.forEach` 仍然按数组处理，为将来放开多选留了余地。Windows 端没有 `chooseMedia`，退化成 `uni.chooseVideo`，只支持视频。

### 上传：只处理最后一个文件

```js
async _handleUpload() {
  let lastIndex = this.fileList.length - 1
  let filePath = this.fileList[lastIndex] && this.fileList[lastIndex].tempFilePath
  if (!filePath) return
  uni.showLoading({ title: "上传中" })
  try {
    const resUpload = await uploadApi(filePath)
    if (resUpload && resUpload.code == 200) {
      this.uploadList.push({
        imageName: resUpload.newFileName,
        imageType: isVideoFileBySuffix(resUpload.url) ? 1 : 0,
        imageUrl: resUpload.url,
      })
    } else {
      this.fileList.pop()
      uni.showToast({ icon: "none", title: friendlyError(resUpload, "上传失败") })
    }
  } catch (e) {
    this.fileList.pop()
    console.warn("[publish._handleUpload] fail", e)
    uni.showToast({ icon: "none", title: friendlyError(e, "上传失败，请重试") })
  } finally {
    uni.hideLoading()
  }
}
```

几个关键点：

1. `uploadApi` 是 `upload('/common/upload', filePath)`，请求层里 `upload` 固定 `auth: true`、`toast: false`，也就是上传必须登录，错误提示交给这里自己处理。
2. 上传接口的响应结构和其它接口不一样：其它接口业务数据在 `res.data`，这里直接读 `resUpload.newFileName` 和 `resUpload.url`，说明后端把新文件名和地址平铺在了响应体顶层。
3. `imageType` 不是选的时候定的，是上传成功后用 `isVideoFileBySuffix(resUpload.url)` 按后缀猜的。后缀表在 `tools/util.js` 里，包含 `mp4/avi/mkv/mov/m4v/wmv/asf/flv/webm/3gp/mpeg/mpg/rm/rmvb/ts/vob/ogv`。
4. 失败回滚用的是 `this.fileList.pop()`，也就是「默认失败的一定是最后一个」。

### 删除：两个数组同下标删

```js
delImg(index) {
  this.fileList.splice(index, 1)
  this.uploadList.splice(index, 1)
}
```

这段成立的前提是 `fileList` 和 `uploadList` 严格同序、同长。正常情况下是：选一个 → `fileList` 加一 → 上传成功 → `uploadList` 加一；失败 → `fileList` 弹掉。但只要有一个上传还在路上，`uploadList` 就比 `fileList` 短，下标立刻错位。

### 表单与标签

```html
<input type="text" v-model="postTitle" class="input ptl" placeholder="标题" maxlength="200" />
<textarea v-model="postContent" class="textarea pt" placeholder="内容" auto-height maxlength="2000" />
<JSelectTag :tags="tags" @changeTag="changeTag" />
```

标题 200 字上限、正文 2000 字上限，都由 `maxlength` 在输入层截断。正文 `auto-height`，同时 CSS 给了 `min-height: 140rpx`、`max-height: 280rpx`。

标签组件不维护自己的选中态，而是直接改父级传进来的数组：

```js
clickTag(index) {
  if (this.tags[index].active) {
    this.tags[index].active = false;
  } else {
    this.tags[index].active = true;
  }
}
```

父级再用一个 deep watch 把选中的名字拼成字符串：

```js
watch: {
  tags: {
    deep: true,
    handler(val) {
      let res = [];
      this.tags.map(item => {
        if (item.active) res.push(item.name)
      })
      this.$emit("changeTag", res.join(","))
    }
  }
}
```

所以最终提交的 `tag` 是 `"标签A,标签B"` 这样的逗号串，一个都不选就是空串。

### 发布：校验 → 提交 → 清空

```js
toPublish() {
  const title = (this.postTitle || "").trim();
  const content = (this.postContent || "").trim();
  if (!title) { uni.showToast({ icon: "none", title: "请输入标题" }); return; }
  if (!content) { uni.showToast({ icon: "none", title: "请输入内容" }); return; }
  let data = {
    postTitle: title,
    postContent: content,
    postImageList: this.uploadList,
    tag: this.tag
  }
  this.$emit("publish", data)
}
```

页面上的 mixin 接住这个事件：

```js
async publish(obj) {
  uni.showLoading({ title: "发布中" })
  try {
    await addPostApi(obj)
    uni.hideLoading()
    uni.showToast({ title: "已发布，待审核" })
    this.$refs.publish.publishSuccess();
  } catch (e) {
    uni.hideLoading()
    console.warn("[forum.publish] fail", e)
    uni.showToast({ icon: "none", title: friendlyError(e, "发布失败，请稍后重试") })
  }
}
```

`addPostApi` 是 `post('/biz/posts/add', data, {}, true, false)`，最后一个参数把请求层的自动 toast 关掉了，错误提示统一由 `friendlyError` 生成。成功后的文案是「已发布，待审核」，说明帖子要先过审核才出现在列表里。

清空发生在组件内部：

```js
publishSuccess() {
  this.fileList = [];
  this.uploadList = [];
  this.postTitle = "";
  this.postContent = "";
  this.show = false;
}
```

## 3. 空和失败怎么处理

**表单空值**：标题和正文都会 `trim`，全是空格等同于空，会分别提示「请输入标题」「请输入内容」。媒体和标签都不是必填，纯文字帖、无标签帖都能发。

**上传失败**：`fileList.pop()` 回滚 + `friendlyError` 提示。`friendlyError` 会按 `code` 翻译 401/403/404/500，其它业务码直接用后端 `msg`，并过滤掉「认证失败」「无法访问系统资源」这类技术性描述。这条处理链路是整个项目里比较完整的一处。

**取消选择**：`chooseMedia` 的 `fail` 回调不区分「用户主动取消」和「真的失败」，统一提示「选择失败，请重试」。在部分平台上用户点取消也会看到这条并不准确的提示。

**上传中发布**：这是真实缺口。`toPublish` 只校验标题和正文，不检查 `fileList.length` 和 `uploadList.length` 是否相等，也不看有没有正在进行的上传。用户选完图立刻点发布，`postImageList` 里就只有已经上传完成的那部分，剩下的图静默丢失，发布本身还会成功。

**重复提交**：`publish` mixin 没有 pending 锁，`JMainBtn` 也没有 loading 或 disabled 态。快速连点两次「发 布」会发两次 `addPostApi`，两次 `showLoading` 和两次 `hideLoading` 交错，大概率产生两条重复帖子。

**发布失败**：只弹 toast，不清空表单、不关闭面板，用户可以原样再点一次。这是正确的处理方式。

**401**：`addPostApi` 传的 `auth` 是 `true`，无 token 时请求层直接 reject 401，走到 `friendlyError` 变成「登录已过期，请重新登录」；有 token 但过期则先走 `silentLogin401` 重登再重放一次。

**关闭面板**：`closeable` 的 X 和遮罩都只是隐藏 popup，不中断正在进行的上传，也不清空已填内容。上传会在后台完成并写进 `uploadList`，下次打开面板能看到那张图。

**发布成功后**：表单和媒体被清空，但 `tag` 和标签组件的 `active` 状态没有重置。`publishSuccess` 只清了 `postTitle`、`postContent`、两个文件数组，`tag` 变量和 `tags[i].active` 都还在。所以第二篇帖子会默认继承上一篇的标签，而且面板打开时那个标签仍是高亮的。

## 4. 界面为什么要这样排版

**弹层从底部起，占满宽度**。发帖是「在当前列表上叠加一个动作」，不是要跳走的任务，底部弹层能保留论坛列表作为背景，关闭成本也低。`padding: 90rpx 40rpx 60rpx`：顶部 90rpx 给关闭按钮留位置，左右 40rpx 与论坛卡片的 40rpx 内边距对齐，底部 60rpx 收尾。

**媒体区固定两列 280rpx**：

```scss
.media-box {
  width: 570rpx;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-gap: 10rpx;
  .item { width: 280rpx; height: 280rpx; }
}
```

280 + 10 + 280 = 570rpx，两个方格加间距刚好等于容器自身的宽度。但 `.inner` 左右各有 40rpx 内边距，内容区实际是 670rpx，所以媒体区右侧会空出 100rpx，没有铺满整行——这是写死的宽度和自适应内边距之间的小错位。图片用 `aspectFit` 完整显示不裁剪，视频用原生 `<video>` 直接给播放控件。加号按钮是同样的 280rpx 灰底方格（`#F6F6F6`），视觉上和已有媒体同权，不会显得像次要操作。图片上限 4 张，两行正好排满。

删除按钮是 60rpx 的红色 `close-circle-fill`，绝对定位在右上角 10rpx，`z-index: 9999` 压住图片，并加了 `@tap.stop` 防止点删除时触发图片预览（虽然预览本身是空实现）。

**媒体区与表单之间有一条 1px 的 `#D9D9D9` 分割线**，把「附件」和「文字」分成两个区块。

**标题和正文复用详情页的排版类**：标题 `.ptl`（32rpx / 48rpx / 700），正文 `.pt`（28rpx / 44rpx / `#666`）。输入框高度 60rpx，正文最小 140rpx、最大 280rpx，占位色 `#A7A7A7`。这样发出去的内容和详情页读到的观感一致，用户输入时看到的就是最终形态。

**标签胶囊**是浅黄底 + 24rpx 小字，高 50rpx、圆角 25rpx，选中换成实心 `#FFCA42`：

```scss
.tag { background: lighten(#FFCA42, 26%); }
.tag-active { background: #FFCA42; }
```

黄色是这套界面里唯一不属于品牌蓝的强调色，用在标签上是为了和「操作按钮」区分——标签是分类，不是提交。

**发布按钮**是满宽、80rpx 高、40rpx 圆角的品牌蓝按钮，加粗 32rpx 白字，`hover-class` 用 `darken(#0047bb, 10%)` 压深。它在最底部、独占一行，是弹层里唯一的实心蓝，视觉权重最高。

**入口悬浮按钮**是 102rpx 的图片，`position: fixed; right: 32rpx; bottom: 400rpx`。固定在右侧中部而不是右下角，是为了避开列表底部的加载提示和 tab 栏。

## 5. 代码怎么落地

把这条链路折成几条能直接复用的结论：

**1）两个数组，两种职责。** `fileList` 装 `uni.chooseMedia` 返回的临时文件（有 `tempFilePath`，只用于上传），`uploadList` 装服务端返回的正式资源（有 `imageUrl`、`imageType`、`imageName`，用于预览和提交）。提交时只发 `uploadList`，所以「还没传完的图不会被提交」是设计使然，但代码没有把这个事实告诉用户。

**2）上传结果的类型靠后缀猜。** 后端不返回媒体类型，前端用 `isVideoFileBySuffix(url)` 判断。这意味着：URL 没有后缀、或后缀不在白名单里（比如 `heic`），图片会被当成视频渲染；反过来，视频 CDN 地址不带后缀会被当成图片。

**3）标签状态存在父级数组里。** `select-tag` 没有 `data`，选中态就是 `tags[i].active`。好处是父级拿到的 `tags` 天然带着选中信息；坏处是组件在改 props，而且这个 `tags` 数组正是论坛顶部 tab 用的同一个数组（`getTabs()` 里 `this.tags = list`），标签的 `active` 会跨弹层、跨帖子残留。

**4）成功回调只清一半状态。** `publishSuccess()` 清了标题、正文、两个文件数组，漏了 `tag` 和 `active`。下次打开面板，上一篇选的标签还亮着，`this.tag` 也还是旧值。

**5）发布后不刷新列表。** mixin 的 `publish` 成功后只调 `publishSuccess()`，没有重新拉列表。论坛页的 `onShow` 只在「从别的页面回来」时触发，popup 关闭不算页面切换，所以新帖（审核通过后）要等下拉刷新或切 tab 才会出现。

**6）几处确定的缺陷清单**（都可在源码里直接定位）：

- `toPublish` 不检查上传是否完成，上传中点发布会导致图片丢失且无提示。
- `publish` 没有防重复提交，连点会发出两条帖子。
- `_handleUpload` 失败时 `fileList.pop()` 假定失败的是最后一个文件；两个上传并发时，弹掉的可能是另一个正在上传的文件。
- `delImg(index)` 同时按同一 index 删两个数组，上传中删除会错位。
- `previewImg(item)` 是空函数，点已上传的图片没有任何反应。
- `publishSuccess` 不清 `tag` 和标签 `active`，下一篇默认继承上一篇标签。
- 发布成功后列表不刷新，用户看不到自己刚发的帖子（即便审核通过）。
- `.select-tag` 没有 `flex-wrap`，标签多于一屏时会横向溢出。
- 关闭面板不中断上传，上传结果会在后台写进已关闭面板的 `uploadList`。
- 媒体只有 4 个的数量上限和视频 30 秒的时长限制，没有文件大小校验。

一句话总结这个模块：上传的容错做得比提交的容错好——`friendlyError` 覆盖了所有失败分支，但「什么时候允许提交」这一层几乎没有约束。
