---
title: 发帖弹层：320 行发布器，和四个只有「上传中」才看得见的坑
description: 基于 components/publish、select-tag 与论坛页 publish mixin 的真实源码，拆解发帖弹层的媒体格、上传时序、标签选择——点图预览是空函数、并发上传会删错记录、发布成功后幽灵媒体会回到空列表、标签改的是父页面数组且从不清理。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 发帖组件, 代码质量]
chapter: community
order: 4
level: deep
featured: false
draft: false
project: robot-forum-miniapp
---

上一篇拆的是评论区，这一篇拆评论区的上游：把内容发出去的那一层。

`components/publish` 320 行，加上它依赖的 `select-tag` 60 行、`btn` 32 行、`location` 33 行，一共 445 行。入口只有论坛页右下角的悬浮按钮。

这个组件的特别之处在于：它自己不发请求。上传是它做的，发布请求是页面的 `publish` mixin 发的，成功后又回调它的 `publishSuccess()` 清状态。三个文件来回调用，时序问题都藏在这条链上。

## 1. 用户要完成什么

| 用户动作 | 走到的代码 | 用户看到 |
| --- | --- | --- |
| 点右下角悬浮按钮 | `toPublishPost` → `checkAuth` → `$refs.publish.showPop()` | 底部弹层升起 |
| 加图/视频 | `chooseMedia` → `_handleUpload` → `uploadApi` | 全局「上传中」，完成后出现缩略图 |
| 删掉一张 | `delImg(index)` | 格子消失 |
| 点缩略图 | `previewImg(item)` | **什么都不发生** |
| 选标签 | `JSelectTag` → `changeTag` | 黄色胶囊变实心 |
| 点「发 布」 | `toPublish` → emit → 页面 `publish` | 全局「发布中」，成功后弹层关闭、toast「已发布，待审核」 |

进弹层前先过登录：`checkAuth()` 不通过会弹「当前操作需要登录」（`pages/forum/index.vue:184-190`），上传接口本身也是 `auth: true`（`tools/request.js:212-216`）。

发出去的内容一律待审核，所以成功提示是「已发布，待审核」，列表也不刷新——审核通过前它本来就不会出现在论坛里。

## 2. 页面要怎么走

### 2.1 弹层长什么样

```html
<!-- components/publish/index.vue:3-39 -->
<up-popup v-model:show="show" mode="bottom" closeable>
    <view class="inner">
        <view class="tp">
            <view class="media-box">
                <view class="item animate__animated animate__fadeIn" v-for="(item,index) in uploadList">
                    <image v-if="checkImg(item)" :src="getImgPath(item)" mode="aspectFit" class="img"
                        @tap="previewImg(item)"></image>
                    <video v-else :src="getVideoPath(item)" class="video"></video>
                    <view class="icon-box" @tap.stop="delImg(index)">
                        <up-icon name="close-circle-fill" size="60rpx" color="#C70038" :index="index"></up-icon>
                    </view>
                </view>
                <view class="item btn fc" @click="chooseMedia" v-show="uploadList.length<4">
                    <image :src="addIcon" mode="aspectFit" class="add-icon"></image>
                </view>
            </view>
        </view>
        <view class="cnt">
            <input type="text" v-model="postTitle" class="input ptl" placeholder="标题" maxlength="200" />
            <textarea v-model="postContent" class="textarea pt" placeholder="内容" auto-height maxlength="2000" />
            <!-- 位置入口已注释 -->
            <JSelectTag :tags="tags" @changeTag="changeTag" />
        </view>
        <view class="btm">
            <JMainBtn name="发 布" fontSize="32" @onClick="toPublish" />
        </view>
    </view>
</up-popup>
```

弹层是 `mode="bottom"` 的 `up-popup`，`closeable` 自带右上角关闭。`inner` 的 `padding: 90rpx 40rpx 60rpx`（`publish/index.vue:213-215`），顶部 90rpx 就是给那个关闭按钮让位。

内部三块：媒体区（`tp`）、文本区（`cnt`）、按钮区（`btm`）。媒体区和文本区之间有一条 1px 的 `#D9D9D9` 分隔线（`publish/index.vue:217-220`）。

### 2.2 媒体格：2×2，最多 4 个

```scss
// components/publish/index.vue:221-231
.media-box {
    width: 570rpx;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 10rpx;

    .item {
        width: 280rpx;
        height: 280rpx;
        position: relative;
    }
}
```

570 = 280 × 2 + 10，刚好两列。所以上限 4 是布局推出来的：两行四格，第五个没有位置，加号按钮用 `v-show="uploadList.length<4"` 隐藏。

删除按钮绝对定位在格子右上角，`size="60rpx"` 的 `close-circle-fill`，红色 `#C70038`（`publish/index.vue:11-13,242-247`）。红色只出现在这一个地方，和全站的品牌蓝、标签黄都不一样——删除是不可逆操作，用了一个独立色。

### 2.3 选媒体：两个平台分支

```js
// components/publish/index.vue:141-168
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
            sourceType: ['album', 'camera'],
            maxDuration: 30,
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

`count: 1`，一次只能选一个。选完立刻上传，不等用户点发布——所以图片在点「发 布」之前就已经在服务器上了。

`platform` 在 `mounted` 里取一次（`publish/index.vue:82-84`），只有 Windows 分支用它：Windows 版微信没有 `chooseMedia`，退回 `chooseVideo`，代价是那一端只能发视频，发不了图。

### 2.4 上传：先占位，成功才进 uploadList

```js
// components/publish/index.vue:169-195
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

两个数组：`fileList` 存 `chooseMedia` 返回的临时文件（有 `tempFilePath`），`uploadList` 存上传成功后的服务端记录（`imageName`、`imageType`、`imageUrl`）。模板只渲染 `uploadList`——上传中什么都没有，只有一个全局遮罩。

上传失败时 `fileList.pop()`，把刚推进去的那条撤掉；成功则保留。**这是整个组件最容易出问题的地方**，后面第 3 节展开。

### 2.5 发布：组件只组装数据

```js
// components/publish/index.vue:94-113
toPublish() {
    const title = (this.postTitle || "").trim();
    const content = (this.postContent || "").trim();
    if (!title) {
        uni.showToast({ icon: "none", title: "请输入标题" });
        return;
    }
    if (!content) {
        uni.showToast({ icon: "none", title: "请输入内容" });
        return;
    }
    let data = {
        postTitle: title,
        postContent: content,
        postImageList: this.uploadList,
        tag: this.tag
    }
    this.$emit("publish", data)
}
```

校验只有「标题非空」「内容非空」，都做了 `trim`。`postImageList` 直接传 `uploadList` 数组，元素是上传接口返回的三字段结构。

页面接住之后才发请求：

```js
// pages/forum/mixins/publish.js:10-23
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

`addPostApi` 传的是 `post(url, data, {}, true, false)`（`api/index.js:78-80`），`toast: false`——请求层不弹提示，交给这里的 `friendlyError`，避免两次错误提示。

成功后回调 `publishSuccess()`：

```js
// components/publish/index.vue:200-206
publishSuccess() {
    this.fileList = [];
    this.uploadList = [];
    this.postTitle = "";
    this.postContent = "";
    this.show = false;
}
```

清四个字段、关弹层。**没有清 `tag`。**

### 2.6 标签：子组件改的是父组件的数组

`tags` 是从页面一路传下来的：

```html
<!-- pages/forum/index.vue:5,16 -->
<JTabs :tags="tags" @change="changeTag" :disabled="loading" ref="tabs" />
...
<JPublish ref="publish" :tags="tags" @publish="publish" />
```

同一份 `tags` 数组同时给了顶部标签栏和发布弹层。`select-tag` 收到之后，点一下是这样处理的：

```js
// components/select-tag/index.vue:34-40
clickTag(index) {
    if (this.tags[index].active) {
        this.tags[index].active = false;
    } else {
        this.tags[index].active = true;
    }
}
```

没有 `$emit` 通知父级换一份新数组，而是直接往 prop 的元素上写 `active`。Vue 3 里这是响应式的，界面会立刻变黄；但这份状态属于父页面，组件关掉、发布成功、甚至切到别的 tab，`active` 都还在。

标签是**多选**：`changeTag` 把所有权为 `active` 的名字拼成逗号串：

```js
// components/select-tag/index.vue:19-31
watch: {
    tags: {
        deep: true,
        handler(val) {
            let res = [];
            this.tags.map(item => {
                if (item.active) {
                    res.push(item.name)
                }
            })
            this.$emit("changeTag", res.join(","))
        }
    }
},
```

所以后端收到的 `tag` 可能是 `"经验分享,求助"`。页面只把它原样塞进 `data.tag`（`publish/index.vue:91-93`），不做拆分或校验。

## 3. 空和失败怎么处理

### 3.1 点图不预览

```js
// components/publish/index.vue:126-136
previewImg(item) {
    // this.show = false;
    // setTimeout(() => {
    //     this.$nextTick(() => {
    //         uni.previewImage({
    //             current: 0,
    //             urls: [this.getImgPath(item)]
    //         })
    //     })
    // }, 300)
},
```

函数体全被注释，只剩空壳。模板上却还绑着 `@tap="previewImg(item)"`，所以用户点缩略图的反馈是「没反应」——不是禁用态、没有提示，就是没反应。

从注释能看出来，原来的实现要先关弹层、等 300ms、再 `previewImage`，大概是因为 `previewImage` 和 `up-popup` 的层级冲突（预览层被弹层盖住）。后来整段被注释，入口忘了摘。

### 3.2 并发上传：`pop()` 删的不是失败的那一条

`_handleUpload` 失败时执行 `this.fileList.pop()`。`pop()` 删的是**数组最后一个**，不是「这次上传失败的那个」。

上传是并发的：`chooseMedia` 成功后立刻 `_handleUpload()`，没有上传中的锁。用户在第一个还在传的时候再点加号，`fileList` 里就有两条：

```
fileList = [A, B]
上传 A → 失败 → pop() → 删掉的是 B
```

A 留在 `fileList` 里成了孤儿，B 被误删——但 B 的上传可能成功了，`uploadList` 里有 B 的记录，而 `fileList` 里没有了。下一次上传取 `lastIndex` 时又按新的末尾算，两个数组从此对不上。

`delImg` 假设两个数组下标一一对应：

```js
// components/publish/index.vue:137-140
delImg(index) {
    this.fileList.splice(index, 1)
    this.uploadList.splice(index, 1)
}
```

模板传的 `index` 是 `uploadList` 的下标。并发上传完成顺序和选择顺序不一定一致（A 先选后传完），一旦错位，删掉的就是另一条媒体：界面少了一张，服务器上多了一张没人引用的文件。

上传本身没有删除接口，`delImg` 只改本地两个数组。用户加了又删的图会一直留在服务器上。

### 3.3 发布成功后的幽灵媒体

`publish()` 成功后调 `publishSuccess()`，把 `uploadList` 清空。但如果在点「发 布」的那一刻还有上传在飞，它的 `then` 会在清空之后执行：

```
uploadList = []        ← publishSuccess
...
await uploadApi 返回   ← 迟到的上传
this.uploadList.push(...)  ← 空数组里多了一条
```

下次打开弹层，媒体格会凭空出现一张上次的图，而标题、内容都是空的。用户以为没删干净，删掉它又会去 `fileList` 里 splice 一个不存在的下标。

同一个时序还会导致另一种结果：点发布时正在传的图没进 `postImageList`，帖子发出去了，但那张图不在帖子里——用户以为传上了。

### 3.4 取消选择也提示失败

```js
// components/publish/index.vue:163-165
fail: () => {
    uni.showToast({ icon: "none", title: "选择失败，请重试" })
}
```

`chooseMedia` 的 `fail` 同时覆盖「用户取消」和「真的失败」，回调里不区分 `errMsg`，所以用户点左上角取消，也会收到一条「选择失败，请重试」。

### 3.5 后端非 200 的分支走不到

`_handleUpload` 里有一段处理「上传接口返回非 200」：

```js
// components/publish/index.vue:176-186
if (resUpload && resUpload.code == 200) {
    this.uploadList.push({...})
} else {
    this.fileList.pop()
    uni.showToast({ icon: "none", title: friendlyError(resUpload, "上传失败") })
}
```

但 `upload()` 的 `custom` 里配了 `catch: true`（`tools/request.js:212-216`），响应拦截器遇到非 200 会直接 `Promise.reject(data)`（`request.js:47-57`）。也就是说 `await uploadApi(...)` 拿到的一定是 200 的 data，非 200 会跳进 `catch`，`else` 分支永远不执行。

两段代码的提示文案还不一样：「上传失败」和「上传失败，请重试」。实际生效的是后者。

### 3.6 空值和上限

| 情况 | 现在的行为 |
| --- | --- |
| 没有标题 | toast「请输入标题」，不发请求 |
| 没有内容 | toast「请输入内容」 |
| 只有空格 | `trim()` 后按空处理，正确 |
| 没有标签 | `tag: ""` 照样能发 |
| 没有媒体 | `postImageList: []` 照样能发 |
| 第 5 个媒体 | 加号按钮 `v-show` 隐藏，但判断的是 `uploadList.length`，不含正在上传的 |
| 上传中关闭弹层 | 上传继续，结果照样写进 `uploadList` |

上限这条要展开：加号按钮的显隐只看 `uploadList.length<4`（`publish/index.vue:15`）。如果 4 张都在上传中，`uploadList` 还是 0，按钮仍然显示，用户可以继续选——最后 `uploadList` 变成 5、6 个，2×2 的格子放不下，第三行溢出到文本区。

## 4. 界面为什么要这样排版

### 4.1 底部弹层，不是新页面

发布页项目里已经有一个（`pages/publish`），论坛这里用的是弹层。原因写在交互上：用户是在浏览列表的过程中想发帖，弹层保留列表在背后，关掉就回到原位；新页面要压栈、返回、再恢复列表位置。

代价是弹层里没有导航栏，只能靠右上角的关闭按钮和遮罩退出，所以 `padding-top` 要给到 90rpx，否则关闭按钮会压在媒体格上。

### 4.2 媒体在前，文字在后

顺序是「图 → 标题 → 内容 → 标签 → 按钮」。图片放最上面，因为它是唯一需要即时反馈的操作：选完、传完、出现在格子里，三步都能看见。文字输入不需要。

如果反过来（先写字再传图），用户写完一大段再上传失败，情绪成本更高。

### 4.3 2×2 而不是横向滚动

横向滚动（一排缩略图左右滑）在微信里很常见，但这里选了 2×2 固定格：

- 上限只有 4，一屏能全放下，不需要滚动提示；
- 删除按钮 60rpx 放在 280rpx 的格子里，触控目标够大；横向小图（常见 160rpx）上放删除按钮容易误触；
- 空位由加号按钮填充，格子数固定，弹层高度不随图片数量跳变。

### 4.4 输入框的尺寸

标题是单行 `input`，高 60rpx；内容是 `textarea`，`min-height: 140rpx`、`max-height: 280rpx`、`auto-height`（`publish/index.vue:270-286`）。

`auto-height` 让内容从 140 起随输入长高，到 280 停。140 大约三行，280 大约六行——再多就得在 280 的框里滚，但 `textarea` 本身没开滚动，所以更长的内容会被裁。这也是为什么 `maxlength` 设到 2000 却只给六行高度：长文不是这个弹层的目标场景。

### 4.5 标签为什么是黄色

全站主色是蓝 `#0047bb`，标签用的却是 `#FFCA42`（选中）/ 更浅的 26% 版本（未选中）（`select-tag/index.vue:49-59`）。

标签在语义上不是「主操作」，用主色会和底部的「发 布」按钮抢注意力。黄色在白色弹层里足够显眼，又不会被当成按钮。

（黄色这套只在发布弹层出现，论坛列表的标签是另一套样式——同一个「标签」概念，两种视觉。）

### 4.6 按钮区留白

`.cnt` 有 `margin-bottom: 80rpx`（`publish/index.vue:266-268`），按钮下面是 `padding-bottom: 60rpx`。这段空白是为了键盘：弹层贴底，键盘弹起时如果按钮贴着输入框，会几乎点不到。

## 5. 代码怎么落地

### 5.1 结构

```
pages/forum/index.vue
  ├─ JFloatingBtn            → toPublishPost() → checkAuth() → $refs.publish.showPop()
  ├─ JTabs        :tags="tags"
  ├─ JPublish     :tags="tags" @publish="publish" ref="publish"
  │    ├─ up-popup（bottom, closeable）
  │    ├─ 媒体格：uploadList（2×2，上限 4）+ 加号 → chooseMedia
  │    │     └─ chooseMedia → fileList.push → _handleUpload → uploadApi
  │    ├─ 标题 input（200）/ 内容 textarea（2000）
  │    ├─ JSelectTag :tags  → changeTag → tag（逗号串）
  │    └─ JMainBtn「发 布」 → toPublish → emit('publish', data)
  └─ mixins/publish.js       → addPostApi → toast → $refs.publish.publishSuccess()
```

### 5.2 读这一块按这个顺序

1. **两个数组先分清**：`fileList` 是本地临时文件，`uploadList` 是已上传记录。模板只渲染后者，所以「上传中」在界面上是不可见的。
2. **改媒体上限要同时改三处**：`v-show="uploadList.length<4"`、2×2 的 CSS（570/280/10）、以及 `postImageList` 的提交。现在 JS 里没有任何数量校验。
3. **改删除逻辑先对齐两个数组**。`delImg(index)` 的行参是 `uploadList` 的下标，但同一个下标被拿去 splice `fileList`——两者顺序不保证一致。
4. **发布成功后清状态只改 `publishSuccess()`**，那里是唯一的复位入口；`tag` 目前不在里面。
5. **标签选中状态属于页面**，`select-tag` 只改不重置；要清空得让页面换一份新的 `tags` 数组，或者给组件加一个受控 prop。
6. **上传失败的提示统一走 `friendlyError`**，`_handleUpload` 的 `else` 分支是死代码，改文案改在 `catch` 里。

### 5.3 记录的真实问题

| # | 问题 | 位置 |
| --- | --- | --- |
| 1 | `previewImg` 函数体全部注释，点缩略图无任何反应 | `components/publish/index.vue:8-9,126-136` |
| 2 | 上传中可发布：`toPublish` 不看 `fileList` / 上传状态，正在传的媒体不进帖子 | `components/publish/index.vue:94-113` |
| 3 | 发布成功后迟到上传仍会 `push` 进已清空的 `uploadList`，下次打开弹层出现幽灵媒体 | `components/publish/index.vue:177-181,200-206` |
| 4 | 上传失败用 `fileList.pop()` 删「最后一个」而非本次失败项；并发上传时误删别人 | `components/publish/index.vue:169-171,184,189` |
| 5 | `delImg` 用同一个 index 删两个数组；并发上传完成顺序与选择顺序不一致时删错媒体 | `components/publish/index.vue:137-140` |
| 6 | 4 个上限只靠加号的 `v-show`，判断的是 `uploadList` 不含上传中项，JS 无校验，可溢出到 5+ | `components/publish/index.vue:15` |
| 7 | 用户取消选择也会弹「选择失败，请重试」 | `components/publish/index.vue:163-165` |
| 8 | Windows 分支只调 `chooseVideo`，该端无法发图片 | `components/publish/index.vue:143-150` |
| 9 | 「后端非 200」的 else 分支不可达：`upload` 配了 `catch: true`，拦截器已 reject | `components/publish/index.vue:176-186`、`tools/request.js:47-57,212-216` |
| 10 | 图片/视频靠 URL 后缀判断；带 query 的 URL 后缀不匹配，视频会被当图片渲染 | `components/publish/index.vue:114-117,178-181`、`tools/util.js:204-214` |
| 11 | `select-tag` 直接改父组件传入数组元素的 `active`，选中状态跨弹层持久；`publishSuccess` 也不重置 `tag` | `components/select-tag/index.vue:34-40`、`components/publish/index.vue:200-206` |
| 12 | 标签行 `display:flex` 无换行、无滚动，超过 5 个横向溢出屏幕 | `components/select-tag/index.vue:45-55` |
| 13 | `location` 组件是空壳：不调定位 API，`address` 永远是空串，只显示「所在位置」 | `components/location/index.vue:11-18` |
| 14 | `JLocation` 在发布组件和帖子页各注册一次，模板都是注释状态；`getVideoPath` 与 `getImgPath` 实现完全相同 | `components/publish/index.vue:25-29,44,65,118-125`、`pages/post/index.vue:24,37,66` |
| 15 | 上传只用全局「上传中」遮罩，并发时第一个 `finally` 会提前 `hideLoading` | `components/publish/index.vue:173,192-194` |
| 16 | 关弹层不清任何字段：草稿保留、标签残留、幽灵媒体混在一起，无法区分「有意保留草稿」和「没清干净」 | `components/publish/index.vue:196-206` |

### 5.4 验证

- `npm test`：10 个测试文件、146 项全部通过。
- `npm run check`：95 个文件，0 error / 0 warning / 0 hint。
- `npm run build`：Pagefind 索引 93 页，构建无报错。
- `npm run test:build`：构建冒烟 22 项通过。
- 产物：`dist/articles/publish-composer/index.html`、`dist/og/articles/publish-composer.png`。

这个组件的界面逻辑很清楚，问题几乎全在「两个数组 + 一个异步上传 + 一个外部回调」这三者的时序上：`pop()` 删错、`delImg` 删错、发布后 `push` 回来。它们都不会报错，只有用户真的在弱网下连传几张、又赶着点发布时才会暴露。
