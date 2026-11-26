---
title: 通用小件层：一个搜索框、两种空态、三种行，和四份分隔线
description: 基于 components/seach、tabs、no-more、no-comment、fixed-btn、divider 与 cell 三兄弟的真实源码，拆解论坛搜索只能点按钮、Tabs 用「2 + tags.length」硬编码下标、空态与「到底了」共用一张插画、三种行各复制一份 1px 细线、四份分隔线并存，以及积分文案 NaN、客服打开失败无反馈等真实问题。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 组件设计, 交互细节]
featured: false
draft: false
project: robot-forum-miniapp
---

前面几篇按业务模块拆：首页、论坛、详情、发帖、积分、访客预约。这一层不一样，它没有自己的页面，是一堆被页面反复拿走的小零件——搜索框、标签栏、空态插画、悬浮按钮、行、分隔线。

它们加起来只有 661 行，却暴露了这类项目最典型的问题：同一个小东西被复制成 N 份，每一份都各自演化了一点点。

| 文件 | 行数 | 职责 | 被谁引用 |
| --- | --- | --- | --- |
| `components/seach/index.vue` | 95 | 论坛搜索框 | 只被论坛引用 |
| `components/tabs/index.vue` | 90 | 论坛标签栏 | 只被论坛引用 |
| `components/no-more/index.vue` | 29 | 「没有更多」插画 | 首页、论坛、访客记录 |
| `components/no-comment/index.vue` | 48 | 「还没有评论哦」 | 只被帖子详情引用 |
| `components/fixed-btn/index.vue` | 37 | 通用悬浮按钮（emit） | 只被论坛引用 |
| `components/fixed-btn/service.vue` | 68 | 客服悬浮按钮 | 只被首页引用 |
| `components/divider/index.vue` | 15 | 1px 细线 | 全项目零引用 |
| `components/divider/bold.vue` | 13 | 16rpx 灰带 | 积分页、活动详情 |
| `components/cell/index.vue` | 66 | 通用行 | 我的、积分、常见问题、关于我们 |
| `components/cell/cell-inte.vue` | 137 | 积分任务行 | 积分页 |
| `components/cell/cell-inte-detail.vue` | 63 | 积分流水行 | 积分明细页 |

注意第一行的目录名：`seach`，不是 `search`。导入路径也跟着错，全项目只有一处引用，所以这个拼写一直没人改。

## 1. 用户要完成什么

这一层没有独立入口，用户是在别的页面上顺手用到它们：

1. **搜帖子**：在论坛顶部输入关键词，点右边黑色「搜索」按钮，列表刷新成搜索结果。
2. **切分类**：点「所有帖子」「热门」、若干标签、「我的帖子」「我的收藏」中的任意一个，列表换成对应内容；服务端有新热帖时，「热门」右上角出现红点。
3. **看到底**：帖子列表滑到最后一页，底部出现一张插画。
4. **抢首评**：帖子详情没有评论时，看到「- 还没有评论哦 -」和一个「抢首评」按钮，点它光标跳到输入框。
5. **找人**：首页右下角一直挂着一个客服按钮，点了打开企业微信客服会话。
6. **进下一层**：在「我的」、积分、常见问题、关于我们里点任意一行，跳到对应页面。
7. **区分区块**：活动详情、积分页用一条 16rpx 的灰带分隔区块。

用户能感知的失败很具体：搜索框按回车没反应、搜索只剩空格也照样发请求、切到「我的收藏」后搜索框里还留着上一个关键词、没登录点「我的帖子」看到一张「没有更多」的图、评论接口挂了也显示「还没有评论」、积分任务的进度显示成 `NaN`。

## 2. 页面要怎么走

### 2.1 搜索只有「点按钮」这一条路

搜索框的结构是「灰色胶囊 + 黑色按钮」，输入框本身几乎没配任何属性：

```html
<view class="out-box">
  <view class="input-box">
    <image :src="searchIcon" mode="" class="search-icon"></image>
    <input type="text" class="input" v-model="postTitle" />
  </view>
  <view class="btn-box">
    <view class="btn fc" @click="search">搜索</view>
  </view>
</view>
```

```js
search() {
  this.$emit("search", this.postTitle)
}
```

`input` 上没有 `placeholder`、没有 `maxlength`、没有 `confirm-type`、没有 `@confirm`，也没有清空按钮。也就是说：

- 键盘右下角是默认的「完成」，按下去不会触发搜索，只能抬手点那个黑色按钮；
- 空输入框里没有任何提示文字，用户不知道这里能搜什么；
- 组件不做 `trim`，`"   "` 会原样抛给父组件。

父组件收到后直接写进查询条件：

```js
search(postTitle) {
  this.loadAll = false;
  this.queryParams.pageNum = 1;
  this.searchData.postTitle = postTitle;
  uni.pageScrollTo({ scrollTop: 0, duration: 300 });
  this.getList();
}
```

而 `getList()` 开头清空的是另外四个字段：

```js
this.searchData.popularPost = "";
this.searchData.tag = ""
this.searchData.userId = ""
this.searchData.isFavorite = ""
```

`postTitle` 不在其中。这不一定是 bug——输入框里的文字还在，用户能看见当前筛选条件。但它和「我的收藏」分支冲突：那个分支走的是 `collectListApi()`，根本不读 `searchData`，于是搜索框显示着「电机」，列表却是全部收藏，且没有任何提示。

还有一处隐式依赖：`postTitle` 在构造请求时会过滤掉空串，所以清空输入再点搜索，确实能取消筛选。但用户得先自己把文字删干净。

### 2.2 Tabs 是「4 + N」段固定结构，父组件直接改子组件

`_list` 这个 computed 把三部分拼在一起：两个固定头、动态标签、两个固定尾。

```js
_list() {
  let list = [];
  if (this.tags && Array.isArray(this.tags)) {
    this.tags.map(item => {
      list.push({ name: item.name, disabled: this.disabled })
    })
  }
  console.log("_list", list)
  return [
    { name: '所有帖子', disabled: this.disabled },
    { name: '热门', disabled: this.disabled, badge: { isDot: this.isDot } },
    ...list,
    { name: '我的帖子', disabled: this.disabled },
    { name: '我的收藏', disabled: this.disabled },
  ]
}
```

下标因此是硬约定：`所有帖子` 恒为 0，`热门` 恒为 1，标签从 2 开始，`我的帖子` 是 `2 + tags.length`，`我的收藏` 是 `3 + tags.length`。父组件确实按这个算术直接改子组件的 `current`：

```js
changeTab() {
  const tabName = uni.getStorageSync("tabName")
  if (tabName == "post") {
    this.$refs['tabs'].current = 2 + this.tags.length;
  } else if (tabName == "collect") {
    this.$refs['tabs'].current = 3 + this.tags.length;
  }
}
```

这段代码在 `pages/forum/mixins/getData.js` 里，由 `getTabs()` 在标签拉取成功后调用。同时 `pages/forum/index.vue` 的 `initTab()` 会在 `onShow` 时读 storage 里的 `tabName`（「我的」页点「帖子」/「收藏」时写入 `post`/`collect`，再 `switchTab` 到论坛），把 `tabName` 数据改成 `我的帖子`/`我的收藏`。

两个函数写的是同一件事的两半：`initTab()` 改的是「要查哪份数据」，`changeTab()` 改的是「高亮哪一格」。中间靠 storage 字符串粘合，而且只有标签接口成功时才会执行后半段。标签接口失败时（`getTabs` 的 `catch` 只打 warn），`tags` 保持空数组、`_list` 只剩 4 项，高亮停在「所有帖子」，列表内容却可能是「我的帖子」。用户在「我的」点进来，看到的是高亮和内容对不上的一屏。

同一份源码里还有三个小问题：

- `lineWidth()` 用字符数乘 28rpx 估算下划线宽度：`let len = name.length * 28; return `${len}rpx``。中文 28rpx 字号下大致对得上，英文数字会偏，而且它是从 `this._list[this.current]` 取对象再读 `.name`，没有任何越界保护。
- `scrollable()` 只在 `tags.length > 1` 时返回 `true`。标签为 0 或 1 个时，4 到 5 个 tab 会关掉横向滚动，只能靠 flex 挤压。
- `_list` 每次重算都 `console.log("_list", list)`，`handleChange` 打印一次，`watch.current` 再打印一次。点一下 tab，控制台至少两条日志；`tags` 或 `disabled` 一变，`_list` 还会再刷一条。

`disabled` 也值得单独说：它被同时塞进了每一个 item，而父组件传的是 `:disabled="loading"`。所以请求进行中整排 tab 都点不动——这挡住了连点，但也意味着加载慢的时候用户完全无法切走。

### 2.3 「到底了」和「列表为空」是两张不同的图，但只做了一张插画

`no-more` 的全部内容就是一张图：

```html
<view class="no-more">
  <image :src="iconNoMore" mode="heightFix" class="icon"></image>
</view>
```

```scss
.no-more {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 100rpx 0;
  .icon { height: 260rpx; }
}
```

图片高 260rpx，上下各 100rpx 留白，合计约 460rpx，没有任何文字。它的语义完全由调用方决定：

- 首页、论坛：`v-show="loadMoreStatus=='nomore'"`，表达「列表到底了」；
- 访客记录页：放在 `<view class="empty" v-if="!filteredList.length && !loading">` 里，旁边配一句 `emptyText`（「暂无预约记录」等），表达「一条都没有」。

同一个组件，两个语义。前者是「你已经看完了」，后者是「这里什么都没有」，视觉上却是同一张图。

`no-comment` 是另一套写法，文字加按钮：

```html
<view class="no-comment">
  <text class="tip">- 还没有评论哦 -</text>
  <view class="btn fc" @tap="startComment">抢首评</view>
</view>
```

点击只做一件事：`this.$emit("startComment")`。详情页接住后转给底部输入栏：

```js
startComment() {
  this.$refs["commentTools"].startComment()
}
```

`comment-tools` 里就是 `this.focus = true`，让 `<textarea :focus="focus">` 获得焦点。链路是通的，但它只在「评论数为 0」时显示——`v-show="commentList.length==0"`，而 `getCommentList()` 的 `catch` 只打一行 warn，`commentList` 保持空数组。接口失败和真的没有评论，在界面上完全一样。

### 2.4 三种行，各复制一份 1px 细线

`cell/index.vue` 是最通用的一行：左边标题、右边内容、最右一个箭头。

```html
<view class="cell" :class="{'border':border}" @tap="clickCell">
  <view class="lf">{{item.title}}</view>
  <view class="rt">{{item.content||""}}</view>
  <image :src="rtIcon" mode="heightFix" class="rt-icon"></image>
</view>
```

`padding: 20rpx 44rpx`、`min-height: 90rpx`、`justify-content: space-between`；箭头用 `position: absolute; right: 44rpx`，所以 `.rt` 要留 `margin-right: 36rpx` 给它让位。分割线是伪元素：

```scss
.border::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 44rpx;
  right: 44rpx;
  height: 1px;
  background: #ccc;
  transform: scaleY(0.5);
}
```

`cell-inte.vue`（积分任务）和 `cell-inte-detail.vue`（积分流水）把这段原样复制了一遍，区别只是前者多一个 `.full-border::after`：

```scss
.full-border::after {
  left: 0rpx !important;
  right: 0rpx !important;
}
```

三份样式完全一致，改一处不会带动另外两处。

更麻烦的是 `border` 的传法，四个调用方有四种写法：

| 调用方 | 写法 | 结果 |
| --- | --- | --- |
| `components/mine-cells/index.vue` | `:border="index<list.length-1"` | 最后一行没有线，正确 |
| `pages/about-us/index.vue` | `:border="true"` | 最后一行也有线，正确写法留在旁边注释里 |
| `pages/integral/index.vue` | `:border="true"` | 同上，注释里留着 `index<pointList.length-1` |
| `pages/integral-detail/index.vue` | `:border="true"` + `:fullBorder="true"` | 每行都是通栏线，最后一行也有 |
| `pages/questions/index.vue` | `:border="true"` | 最后一行也有线，且没有 `:key` |

也就是说，唯一传对的地方是 `mine-cells`，而它恰好在「我的」页面里、有白色卡片包底，最后一行多一条线也不明显；积分和常见问题是整页铺开，最后一行下面会多出一条悬空的灰线。

`questions` 还有两个独立问题。它的 item 是这样拼的：

```html
<ACell v-for="(item,index) in questionList" @onClick="clickCell" :item="{
  title:item.question,
  ...item
}" :border="true" />
```

对象字面量每次渲染新建一个，`v-for` 没有 `:key`，所以列表更新时组件会按位置复用；更关键的是 `...item` 写在 `title` 之后——如果接口返回的对象里本来就有 `title` 字段，它会把 `item.question` 覆盖掉，左边显示的字就变了。`about-us` 里 `getList()` 的映射也是同样的顺序（`{title: item.name, ...item}`），只是那里的接口不返回 `title`，暂时没暴露。

`cell-inte` 自己的两个计算属性也值得记一笔。进度文案：

```js
return `${typeStr} ${item.usedCount*item.pointsValue}/${item.limitValue*item.pointsValue}`
```

`limitType` 为 0 时不带前缀，1 是「今日获得」，2 是「总共获得」。但 `usedCount`、`pointsValue`、`limitValue` 任何一个缺失，乘法就会得到 `NaN`，界面直接显示 `NaN/NaN`。按钮文案还有一处反直觉：`item` 为空时 `disabled` 返回 `true`，显示的是「已完成」——数据没拿到和任务做完，用户看到的是同一句话。而「去完成」一律跳论坛：

```js
toFinish() {
  uni.switchTab({ url: '/pages/forum/index' })
}
```

不管这条任务实际要用户去首页、去预约还是去发帖。

### 2.5 两个悬浮按钮，同一个坐标

`fixed-btn/index.vue` 和 `fixed-btn/service.vue` 的样式几乎逐行相同：

```scss
position: fixed;
right: 32rpx;
bottom: 400rpx;
width: 102rpx;
height: 102rpx;
z-index: 99;
```

差别只在点击行为。通用版把事件抛出去，论坛接住后打开发帖弹层：

```js
clickFixedBtn() {
  this.$emit("onClick")
}
```

客服版自己把事做完：

```js
wx.openCustomerServiceChat({
  extInfo: {
    url: 'https://work.weixin.qq.com/kfid/kfcff831a6cb0051414',
  },
  corpId: 'wwa98f0ea38614b567',
  success(res) { console.log('成功打开客服会话界面', res); },
  fail(err) { console.error('打开客服会话界面失败', err); },
  complete() { console.log('打开客服会话界面调用结束'); }
});
```

两个企业微信参数是硬编码在组件里的。客服版还是一个 `<button>`，所以要额外重置 `&::after { border: 0; }` 和 `padding: 0`，否则小程序会给它画一圈默认边框。失败时只有 `console.error`，用户点了没反应，界面上没有任何提示。

### 2.6 分隔线有四份

先看全局样式表，它在 `App.vue` 里被整份引入：

```scss
.divider {
  width: 100%;
  height: 1px;
  background: #D9D9D9;
}
.bold-divider,
.bd {
  width: 100%;
  height: 16rpx;
  background: #F2F2F2;
}
.scaleY-half,
.sf {
  transform: scaleY(0.5);
}
```

然后项目里又有：

1. `components/divider/index.vue`：把全局 `.divider` 抄了一遍，多加 `transform: scaleY(0.5)`。全项目零引用。
2. `components/divider/bold.vue`：16rpx 灰带，类名拼成了 `blod-divider`——和全局的 `.bold-divider` 差一个字母，所以它完全靠自己的 scoped 样式生效，全局那份同名样式与它无关。
3. `pages/post/index.vue` 第 26 行：`<view class="divider mt20 mb20"></view>`，直接用全局类。没有 `scaleY(0.5)`，所以详情页这条是完整的 1px。
4. `pages/visit/index.vue`：页面内自己定义了两处 `.divider`，`height: 1rpx; background: #eee`，又是另一种粗细和颜色。

同一根线，四种高度、三种颜色、两种实现方式（全局 class 与组件）。真正在跑的是第 2、3、4 种；第 1 种是死代码。

## 3. 空和失败怎么处理

这一层的失败处理可以概括成一句话：**失败被折叠进了「空」**。

| 场景 | 代码路径 | 用户看到 |
| --- | --- | --- |
| 未登录点「我的帖子」 | `getList()` 里 `setEmpty()`：清空列表、`loadAll=true` | 「没有更多」插画，没有登录引导 |
| 未登录点「我的收藏」 | 同上 | 同上 |
| 帖子列表请求失败 | `catch` 里 `stopLoading(); this.loadAll = true` | 同样落到 `nomore`，被呈现成「到底了」 |
| 评论请求失败 | `catch` 只 warn，`commentList` 仍为 `[]` | 「- 还没有评论哦 -」+ 抢首评 |
| 标签接口失败 | `catch` 只 warn，`tags` 为空 | Tabs 少几段，高亮与内容可能不一致 |
| 积分字段缺失 | `usedCount * pointsValue` 等乘法 | `NaN/NaN` |
| 客服打开失败 | `fail` 里 `console.error` | 无任何反馈 |
| 常见问题/关于我们请求失败 | `catch` 只 warn，列表保持 `[]` | 整页空白，没有空态 |

`setEmpty()` 的实现只有三行，但它决定了「未登录」在界面上的样子：

```js
setEmpty() {
  this.store.setPostList([])
  this.loading = false;
  this.loadAll = true;
}
```

`loadAll = true` 让计算属性 `loadMoreStatus` 返回 `nomore`，于是 `up-loadmore` 被 `v-show` 隐藏、`JNoMore` 被显示。从数据结构上说没错——确实没有更多了；从用户角度看，是「你还没登录」被翻译成了一张「到底了」的插画。

同样的问题在列表请求失败时重复了一次，只是位置在 `.catch` 里。由于失败没有单独的状态位，`loadMoreStatus` 只有 `loading` 和 `nomore` 两种取值，「失败」这一态在类型上就不存在。

## 4. 界面为什么要这样排版

**搜索框做成 60rpx 高的胶囊，按钮再缩到 0.8。** 外层 `.search` 是 `padding: 20rpx 30rpx 6rpx`，胶囊 `height: 60rpx; border-radius: 30rpx; background: #EAEAEA`，左右分别是输入区和固定 `100rpx` 的按钮区。按钮本身也是 `100rpx × 60rpx` 的圆角块，但加了 `transform: scale(0.8)`，视觉上是 80 × 48，两侧各留 10rpx 空隙，看起来像胶囊里嵌了一颗小药丸。代价是布局仍按 100 × 60 占位，点击热区比看到的略大（这对移动端反而是好事）。

输入区的写法是 `width: 0; flex: 1`——宽度交给 flex 分配，自己声明 0，避免长文本把按钮挤出去。图标 `position: absolute; left: 15rpx`，输入框 `padding-left: 60rpx`，两者叠加出「图标 + 文字」的间距。

按钮上的 `&:hover` 是死样式。小程序不支持 CSS `:hover`，要按压反馈得用 `hover-class`，而这里没有配。

**Tab 高 70rpx，下划线 6rpx。** `itemStyle` 统一给 70rpx 高，`lineHeight="6rpx"`、`lineColor="#0047bb"`，激活态字号和未激活一样是 28rpx，只靠 `fontWeight: 700` 和颜色区分。外层 `.tabs` 是 `padding: 10rpx 20rpx 20rpx`，配合论坛页的 `up-sticky` 白底，滚动时搜索框和 tab 一起吸顶。

下划线宽度没有跟随 item，而是自己算 `name.length * 28`。这样能得到一条贴着文字的短线，而不是撑满 item 盒宽（论坛页还给 item 加过 `padding: 0 8px`，跟盒宽走会明显偏长）。代价是只对等宽的中文成立。

**空态插画给到 260rpx。** 首页和论坛的空态出现在长列表末尾，前面是卡片，视觉重量大，插图太小会显得像加载失败。上下各 100rpx 留白把插画从最后一张卡片里「托」出来，形成明确的结束感。它有图无字，是因为调用方只把它当分隔符用；到了访客记录页需要文案，就只能由页面在旁边补一句 `emptyText`。

**行高 90rpx、左右 44rpx。** 三个行组件都用 44rpx 作为左右内边距（搜索框是 30rpx 例外），20rpx 上下留白加 90rpx 最小高度，一行正好落在可点区域的下限之上。箭头绝对定位在 `right: 44rpx`，垂直居中，所以右侧文字必须留 36rpx 的 `margin-right` 才不会压到它。

**积分徽标不给圆角。** `+10` 这种徽标用 `lighten(#0047bb, 40%)` 做底色、白色文字、`border-radius: 0rpx`，和右侧圆角的「去完成」按钮形成对比：一个是标签，一个是操作。白色压在浅蓝上对比度偏低，实际阅读时需要凑近看。

**悬浮按钮 102rpx、距右 32rpx、距底 400rpx。** 400rpx 这个值明显是躲底部 tabBar 或输入栏算出来的，两个按钮用同一套坐标，说明这个位置在首页和论坛都成立。`z-index: 99` 保证它压在列表和吸顶栏之上，但不会盖住 `up-modal` 这类弹层。

## 5. 代码怎么落地

### 5.1 文件清单

- `components/seach/index.vue`：`postTitle` 本地状态 + `search` 事件。
- `components/tabs/index.vue`：`tags`/`disabled` 两个 prop，`current`/`isDot` 两个内部状态，`_list`/`lineWidth`/`scrollable` 三个 computed。
- `components/no-more/index.vue`：一张 `no-more.png`，`heightFix`，260rpx。
- `components/no-comment/index.vue`：文案 + 「抢首评」，抛 `startComment`。
- `components/fixed-btn/index.vue`：抛 `onClick`。
- `components/fixed-btn/service.vue`：直接调 `wx.openCustomerServiceChat`。
- `components/divider/index.vue`：零引用。
- `components/divider/bold.vue`：16rpx 灰带。
- `components/cell/index.vue`、`cell-inte.vue`、`cell-inte-detail.vue`：三种行，三份相同的 `.border::after`。

### 5.2 关键调用关系

```text
pages/forum/index.vue
├── <JSearch @search="search" />
│     └── searchData.postTitle = 关键词 → getList()
├── <JTabs :tags :disabled="loading" @change="changeTag" ref="tabs" />
│     ├── 用户点击 → handleChange → current = e.index → emit "change"
│     └── mixin getTabs() → changeTab() → $refs.tabs.current = 2/3 + tags.length
├── <JNoMore v-show="loadMoreStatus=='nomore'" />
└── <JFixedBtn @onClick="toPublishPost" />

pages/post/index.vue
└── <JNoComment v-show="commentList.length==0" @startComment="startComment" />
      └── commentTools.focus = true

pages/index/index.vue
└── <JFixedBtn />  // service.vue，自己调 wx.openCustomerServiceChat
```

### 5.3 如果要改，按这个顺序

1. **搜索补三个属性**：`confirm-type="search"` + `@confirm="search"`、`placeholder`、以及 `search()` 里对 `postTitle.trim()`。这三个改动都在组件内部，不改父组件契约。
2. **切 tab 时明确关键词的去留**：要么在 `changeTag()` 里清空 `searchData.postTitle` 并通知搜索框清空，要么在「我的收藏」分支里把关键词置空并向用户说明。现在是两种行为混着。
3. **Tabs 改成受控**：把 `current` 提成 prop，父组件用 `:current` + `@change` 驱动，删掉 `$refs['tabs'].current = 2 + tags.length` 这种跨组件赋值；下标算术收进组件内部（按 `name` 查找即可，不必依赖 `2 +` / `3 +`）。
4. **`lineWidth` 加保护**：`const obj = this._list[this.current]; if (!obj) return "0rpx"`。
5. **失败态与空态分开**：给列表加一个 `loadError`，`loadMoreStatus` 返回 `error` 时渲染「加载失败，点击重试」，而不是落到 `nomore`；未登录的「我的帖子/我的收藏」直接给登录引导。
6. **评论同理**：`getCommentList()` 的 `catch` 里标记失败，`JNoComment` 只在请求成功且列表为空时显示。
7. **合并三份行样式**：把 `.border::after` / `.full-border::after` 抽成一个 mixin 或全局类，`border` 统一由调用方按 `index < list.length - 1` 传。
8. **删死代码**：`components/divider/index.vue` 全项目零引用，直接删；`divider/bold.vue` 的 `blod-divider` 拼写要么改对、要么并入全局 `.bold-divider`；`pages/post/index.vue` 的 `.divider` 换成组件或保留全局类，二选一。
9. **客服参数外置**：`corpId` 与 `kfid` 挪到配置/环境变量，`fail` 里补 `uni.showToast`。
10. **积分文案兜底**：`btmInfo` 里对三个数值做 `Number(x) || 0`，`disabled` 区分「无数据」与「已完成」两种文案。
11. **`questions` 补 `:key`**，并把 `:item` 改成 `{...item, title: item.question}` ——把 `title` 放在展开之后，避免被后端同名字段覆盖。
12. **清理日志**：`_list`、`watch.current`、`handleChange` 三处 `console.log` 至少在 `_list` 里删掉（computed 里打日志会随每次重算刷屏）。

### 5.4 验证

- `npm test`：9 个测试文件、130 项通过。
- `npm run check`：80 个文件，0 error / 0 warning / 0 hint。
- `npm run build`：Pagefind 索引 76 页、约 1.99 万词。
- `npm run test:build`：构建冒烟全部通过。
- 产物：`dist/articles/common-ui-parts-module/index.html`、`dist/og/articles/common-ui-parts-module.png`。

这一层没有复杂的状态机，问题全在「复制」上：三个行组件复制同一段伪元素、两个悬浮按钮复制同一段定位、四份分隔线复制同一个视觉、两个空态各自发明一套语义。把它们收成一份，比给每一份单独打补丁更省事。
