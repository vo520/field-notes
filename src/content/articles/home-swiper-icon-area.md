---
title: 首页头图：红色状态栏、绿色底条和灰色背景，以及一个从没生效过的默认配置
description: 基于 swiper 与 icon-area 两个组件、首页装配和三个 mixin 的真实源码，拆解首页第一屏：全屏轮播靠 326 减状态栏算高度、prop 默认配置被父组件空对象覆盖、九宫格固定生成三行、按中文名分发跳转，以及生产包里遗留的红绿灰调试底色。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 首页, 代码质量]
featured: false
draft: false
project: robot-forum-miniapp
---

首页第一屏由两块组成：一个顶到屏幕顶部的全屏轮播，和一个三行的九宫格。

`components/swiper/index.vue` 130 行，`components/icon-area/index.vue` 164 行，再加首页的装配代码和 `swiperList` / `swiperSetting` / `icons` 三个 mixin。

这两块组件的共同点是：能跑，但留下了大量「调试期痕迹」——组件里直接写着红、绿、灰三种背景色，一个 prop 的默认值从上线起就没生效过，九宫格不管有没有数据都固定生成三行。

## 1. 用户要完成什么

| 用户动作 | 走到的代码 | 用户看到 |
| --- | --- | --- |
| 进首页 | `onLoad` 并行拉 banner、图标、图标分组、轮播配置 | 全屏轮播 + 九宫格 |
| 左滑轮播 | `up-swiper` 自带 `circular` + `autoplay` | 三张图循环 |
| 点轮播 | `clickSwiperItem` → 按 `type` 分流 | 文章 webview / 帖子详情 / 活动详情 |
| 点九宫格「会员积分」 | 直接 `navigateTo` 积分页 | 积分页 |
| 点「访客预约」 | `needLogin` 包一层再跳 | 未登录先弹提示 |
| 点「我的访客记录」 | `needLogin` 包一层再跳记录页 | 同上 |
| 点其它有链接的图标 | `openArticle({ target, type: 0 })` | webview 或公众号文章 |

轮播点击有一个前置判断：`type` 为 1（帖子）或 2（活动）时要先 `checkAuth()`，`type` 为 0 的纯外链不需要登录（`pages/index/mixins/swiperList.js:27-36`）。

## 2. 页面要怎么走

### 2.1 三段拼装，两块是纯色块

```html
<!-- components/swiper/index.vue:2-12 -->
<view class="swiper-area">
    <view class="status-bar" :style="statBarHStl"></view>
    <view class="swiper-btm" :style="swiperBtmHStl"></view>
    <view class="swiper-box">
        <up-swiper :list="swiperList" height="100%" imgMode="aspectFill" circular radius="0" ... />
    </view>
    <image :src="indexLogoImg" :style="logoImgStl" class="index-logo"></image>
</view>
```

结构是「状态栏占位 + 底部占位 + 绝对定位的轮播层」：前两个是普通文档流里的空 `view`，撑出总高度；轮播层 `position: absolute; top: 0; height: 100%` 盖在它们上面，把整块区域铺满。

所以在轮播图加载出来之前，用户看到的是三块纯色：状态栏是红色，底部是绿色，轮播容器是灰色。

```scss
/* components/swiper/index.vue:96-110 */
.status-bar { background: red; position: relative; z-index: 0; }
.swiper-btm { background: green; position: relative; z-index: 0; }
.swiper-box { background: gray; position: absolute; z-index: 99; top: 0; height: 100%; }
```

这三行不是设计稿里的颜色，是调试用的占位色，一直留在仓库里。正常网速下,`up-swiper` 的图片很快盖住灰色；弱网或图片加载失败时，这就是用户看到的第一屏。

### 2.2 高度是「326 减状态栏」

```js
// components/swiper/index.vue:51-60
swiperBtmHStl() {
    let h = 326 - this.systemInfo.statusBarHeight || 44;
    return { height: `${h*2}rpx` }
},
statBarHStl() {
    return { height: `${this.systemInfo.statusBarHeight || 0}px` }
}
```

这段的意图是：整块头图总高 326（视觉稿上的 px），状态栏部分用真实状态栏高度（px），剩下的给底部占位。为了把 px 换成 rpx，乘了 2——这等于假设屏幕宽度 375pt、750rpx 设计稿。

两个细节值得记一下：

- `326 - statusBarHeight || 44` 的运算顺序是 `(326 - statusBarHeight) || 44`。状态栏高度正常时没问题；如果 `getSystemInfoSync()` 拿不到这个字段（H5 端常见），结果是 `NaN || 44`，落到 44rpx 的兜底高度，头图会缩成一条。
- 同一个组件里，状态栏用 px（`statBarHStl`），底部占位用 rpx（`swiperBtmHStl`）。一旦屏幕宽度不是 375pt 基准，两段高度的比例就开始漂。

### 2.3 logo 压在最上层

logo 用 `getMenuButtonBoundingClientRect()` 对齐小程序胶囊按钮：

```js
// components/swiper/index.vue:62-67, 83-87
logoImgStl() {
    return {
        height: `${this.menuButtonInfo.height || 32}px`,
        top: `${this.menuButtonInfo.top || 48}px`
    }
},
getUiInfo() {
    this.systemInfo = uni.getSystemInfoSync();
    this.menuButtonInfo = uni.getMenuButtonBoundingClientRect();
    const menuButtonInfo = uni.getMenuButtonBoundingClientRect(); // 没被使用
}
```

高度取胶囊高度、`top` 取胶囊上边距，所以 logo 和右侧胶囊在同一水平线上。`z-index: 999` 保证它在轮播层（99）之上。

样式表里还写了一条 `top: 88rpx`（`swiper:128`），但内联 style 的 `top` 优先级更高，这条规则从来没生效过。

### 2.4 轮播配置：默认对象永远用不上

组件给 `settingObj` 写了一份完整的默认配置：

```js
// components/swiper/index.vue:21-31
settingObj: {
    default: () => {
        return {
            indicator: true,
            autoplay: true,
            current: 1,
            interval: 3000,
            duration: 300,
        }
    }
},
```

但首页把 `swiperSetting` 初始化成空对象，并且无条件传进去：

```js
// pages/index/index.vue:119
swiperSetting: {},
```

```html
<!-- pages/index/index.vue:3 -->
<JSwiper :swiperList="swiperList" :settingObj="swiperSetting" @clickSwiperItem="clickSwiperItem" />
```

Vue 的 prop 默认值只在「没传」时生效。这里传了 `{}`，所以组件拿到的是 `{}`，五个字段全是 `undefined`。于是 `:current="settingObj.current-1"` 算出来是 `NaN`，`:indicator="swiperSetting.indicator"` 也是 `undefined`。

真正兜底的是另一份配置——`swiperSetting` mixin 在接口失败时返回的默认对象（`pages/index/mixins/swiperSetting.js:41-49`），内容和组件里那份一模一样。同一个默认值写了两遍，只有第二份有用。

接口成功时，`current` 是 1 基的（默认 1 表示第一张），组件里减 1 转成 0 基。如果后端返回的 JSON 里没有 `current`，`undefined - 1` 还是 `NaN`，swiper 拿到 `NaN` 后停在第几张取决于组件内部处理，不属于可控状态。

### 2.5 九宫格固定三行

图标数据是「一维列表 + 三个分组名」，组件在 computed 里手工拼成三行：

```js
// components/icon-area/index.vue:47-81
_list() {
    let obj0 = {}, obj1 = {}, obj2 = {}
    obj0.title = this.typeList[0]
    obj1.title = this.typeList[1]
    obj2.title = this.typeList[2]
    ...
    this.list.map(item => {
        if (item.functionType == 0) children0.push(item)
        else if (item.functionType == 1) children1.push(item)
        else if (item.functionType == 2) children2.push(item)
    })
    ...
}
```

分组数被写死为 3：`functionType` 只认 0、1、2，`typeList` 只取前三项。后端加第四组，图标不会显示；后端只配两组，第三行会渲染出一个空标题（`{{row.title}}` 渲染 `undefined` 为空）加一个空的 grid 容器，只留下一段 40rpx 的行间距。

每个图标用 `v-show="item.state==1"` 控制显隐（`icon-area:10`）：

```html
<view class="item" v-for="(item,index) in row.children" :key="`item${index}`"
      @tap="openUrl(item)" v-show="item.state==1">
```

`v-show` 只是 `display: none`，元素仍然占着 grid 的一个格子。`grid-template-columns: 1fr 1fr 1fr 1fr 1fr`（`icon-area:142-143`）是固定五列，一组的图标里只要有一个 `state != 1`，那一列就空着，图标不会自动往前补位。

### 2.6 跳转按中文名分发

```js
// components/icon-area/index.vue:84-107
openUrl(item) {
    if (item.functionName == "会员积分") {
        uni.navigateTo({ url: "/pages/integral/index" })
    } else if (item.functionName == "访客预约") {
        needLogin(() => { uni.navigateTo({ url: "/pages/visit/index" }) })
    } else if (item.functionName == "我的访客记录" || item.functionName == "访客记录") {
        needLogin(() => { uni.navigateTo({ url: "/pages/visit/record" }) })
    } else if (item.functionLink) {
        openArticle({ target: item.functionLink, type: 0 });
    }
}
```

和「我的」页面一样，路由挂在展示文案上：后端把「会员积分」改成「积分中心」，这个图标就只剩 `functionLink` 分支，或者什么都不做。

两个访客入口还写着两种写法「我的访客记录 / 访客记录」，说明改名这件事已经发生过一次。

### 2.7 轮播点击的三种 type

轮播数据来自 `/biz/banner/enableList`，点击后由 `openArticle` 按 `type` 分发（`tools/util.js:267-289`）：0 是外链（公众号文章走 `openWeChatArticle`，其它存 `webviewUrl` 再跳 webview 页）、1 是帖子详情、2 是活动详情。

首页额外在 type 1 / 2 外面套了 `checkAuth()`。另外列表里过滤掉了 `bannerId === 6` 的一张图（`swiperList.js:52`），注释写的是「访客页专属头图，避免首页重复展示」——同一张 banner 被两个页面共用，靠 id 硬编码区分。

## 3. 空和失败怎么处理

### 3.1 加载中就是那三块颜色

`up-swiper` 收到 `:loading="swiperList.length==0"`（`swiper:7`），会渲染自己的加载占位。占位之外露出来的就是前面说的红、绿、灰。

### 3.2 轮播失败：清空列表，停在加载态

```js
// pages/index/mixins/swiperList.js:58-64
} catch (err) {
    console.warn("[swiperList] fail", err && err.message)
    this.swiperList = [];
    this.swiperRes = [];
    this.loadingS = false;
    this.loadingSTime = 0;
}
```

失败后 `swiperList` 为空，而 `loading` 的判据就是 `swiperList.length==0`——于是头图永久停在加载占位。没有重试按钮，只能下拉刷新或切页回来（`onShow` 里 `swiperList.length === 0` 会再拉一次）。

### 3.3 配置失败：有两份默认值可选

`swiperSetting` mixin 在三种情况下都回落到默认配置：`res.data` 为空、`JSON.parse` 抛错、请求 reject（`swiperSetting.js:22-39`）。这是全模块唯一有完整兜底的数据。

### 3.4 图标失败：三行空壳

`getIconList` / `getIconTypes` 失败都只 `console.warn` 然后置空数组（`icons.js:16-21, 32-37`）。`_list` 不看数据量，照样返回三个对象——

结果是首页中间出现一张白卡片，里面是三段 40rpx 的空白间距。没有「暂无功能」的提示，也没有隐藏整块。

### 3.5 图标全被关掉的情况

`state` 全部不为 1 时，行标题还在，格子全空。`v-show` 留下的空格子让这张卡片看起来像渲染坏了。

### 3.6 登录要求不一致

首页有一个独立入口「访客预约」（`pages/index/index.vue:5-11`），点击直接 `navigateTo`，注释特意写明：

```js
// pages/index/index.vue:216-221
toVisit() {
    // 访客预约选时段页（/pages/visit/index）允许匿名进入，无需登录守卫；
    // 真正需要登录的环节（submit/record/detail）各自有 needLogin 兜底。
    uni.navigateTo({ url: "/pages/visit/index" })
}
```

而九宫格里的同名图标走的是 `needLogin` 包一层（`icon-area:89-94`）。同一个目标页，从首页卡片进不需要登录，从九宫格进需要登录。

「会员积分」更彻底，连 `needLogin` 都没有，直接跳。

## 4. 界面为什么要这样排版

### 4.1 全屏头图含状态栏

轮播要顶到屏幕最上沿、盖住状态栏区域，所以组件自己画了一段和状态栏等高的占位（`statBarHStl`），总高度按 326 视觉稿算。

用两个空 `view` 撑高度、轮播层绝对定位盖上去，是为了让「状态栏占位」能单独控制高度——小程序里没法直接给 swiper 加 `padding-top` 还能保持图片全屏裁剪。

### 4.2 logo 与胶囊同行

logo 不是居中固定值，而是跟着胶囊按钮的 `getMenuButtonBoundingClientRect()` 走：高度 = 胶囊高度，`top` = 胶囊上边距，`left: 50%` 加 `translateX(-50%)` 水平居中。这样在刘海屏、非刘海屏、iPad 上都能和右侧胶囊对齐。

### 4.3 卡片与网格

九宫格是一张白卡片：外层左右 24rpx、内层 `24rpx 28rpx 32rpx`、圆角 8rpx、`0 2px 8px rgba(0,0,0,0.06)` 阴影（`icon-area:113-126`）。行与行之间 40rpx，行标题 32rpx/700、下边距 30rpx。

每组固定 5 列，图标 52rpx、名称 24rpx，图标下留 16rpx。5 列是这个尺寸下每格不超过 130rpx 的上限，再多一行就挤了。

## 5. 代码怎么落地

### 5.1 结构

```
components/swiper/index.vue          130  全屏轮播：占位块 + 绝对定位层 + 胶囊对齐 logo
pages/index/mixins/swiperList.js      66  轮播数据：过滤 bannerId 6、type 分流
pages/index/mixins/swiperSetting.js   50  轮播配置：JSON.parse + 三处默认兜底
components/icon-area/index.vue       164  九宫格：固定三行、五列 grid、按中文名分发
pages/index/mixins/icons.js           42  图标与分组：锁 + 超时释放
pages/index/index.vue                 装配：onLoad/onShow/下拉 三处刷新
```

### 5.2 阅读顺序

1. `pages/index/index.vue:2-13`——先看首页第一屏的装配顺序，轮播在 `JUserCard` 之前。
2. `swiper/index.vue:2-12`——三个占位块和一个轮播层的关系。
3. `swiper/index.vue:50-67`——两段高度和 logo 定位，注意 px 与 rpx 混用。
4. `swiper/index.vue:20-37` 对照 `index.vue:119`——看清楚为什么 prop 默认对象不生效。
5. `icon-area/index.vue:47-81`——三行是怎么被拼出来的，以及 0/1/2 的硬编码。
6. `icon-area/index.vue:84-107`——中文名分发和两种登录策略。
7. `swiperList.js:27-65`——轮播点击与失败处理。
8. `index.vue:142-180`——三个入口各自的刷新范围。

### 5.3 真实问题

| # | 问题 | 位置 |
| --- | --- | --- |
| 1 | 红 / 绿 / 灰调试底色留在组件里，弱网时就是首屏 | `components/swiper/index.vue:96-110` |
| 2 | `326 - statusBarHeight \|\| 44` 优先级错误，拿不到状态栏高度时退化成 44rpx | `swiper:52-55` |
| 3 | 同一组件内 px 与 rpx 混用，非 375pt 宽度下两段高度比例漂移 | `swiper:54,59` |
| 4 | prop 默认配置永不生效：父组件传入 `{}`，五个字段全为 undefined | `swiper:21-31`、`index.vue:119` |
| 5 | `current` 1 基减 1，配置缺字段时 `NaN` 传给 swiper | `swiper:8`、`swiperSetting.js:45` |
| 6 | 默认轮播配置写两份（组件 prop + mixin 兜底），内容完全重复 | `swiper:22-30`、`swiperSetting.js:41-49` |
| 7 | `SwiperTestImg` 只被注释引用，import 仍保留 | `swiper:17,43-47` |
| 8 | `getUiInfo` 在 created 与 mounted 各调一次，mounted 的判空条件实际恒为假；内部还有一个未使用的 `menuButtonInfo` | `swiper:69-76,86` |
| 9 | `.index-logo { top: 88rpx }` 被内联 `top` 覆盖，是死样式 | `swiper:128`、`swiper:65` |
| 10 | 九宫格分组数写死 3，`functionType` 只认 0/1/2，多一组不显示、少一组出空标题 | `icon-area:53-79` |
| 11 | 数据为空时仍渲染三行空壳，没有「暂无功能」空态 | `icon-area:47-81` |
| 12 | `v-show` 隐藏图标仍占 grid 格，关闭的图标会在行内留洞 | `icon-area:10,142-143` |
| 13 | 跳转按中文 `functionName` 比较，无 `default` 分支 | `icon-area:84-107` |
| 14 | 「会员积分」不校验登录，同名「访客预约」却要登录，且与首页 `toVisit` 注释矛盾 | `icon-area:85-94`、`index.vue:216-221` |
| 15 | `getObjValue` import 后从未使用 | `icon-area:23-25` |
| 16 | `onLoad` 里 `getNewsList` 被调两次（直接调 + `easyFresh`），靠 5 秒锁碰巧去重 | `index.vue:149,150,197` |
| 17 | 下拉刷新硬编码 7 个锁名，新增 mixin 的锁不在列表里就永远清不掉 | `index.vue:170-175` |
| 18 | 分享 `title` 为空字符串，分享卡片没有标题 | `index.vue:81-84` |
| 19 | `this.list.map(...)` 当 `forEach` 用，无返回值 | `icon-area:61-69` |

### 5.4 验证

- `npm test`：10 个测试文件、147 项全部通过。
- `npm run check`：95 个文件，0 error / 0 warning / 0 hint。
- `npm run build`：Pagefind 索引 96 页，构建无报错。
- `npm run test:build`：构建冒烟 22 项通过。
- 产物：`dist/articles/home-swiper-icon-area/index.html`、`dist/og/articles/home-swiper-icon-area.png`。

这两块组件的结构不难，问题都集中在「默认值到底谁说了算」：组件写了一份默认配置，父组件传了空对象把它顶掉，mixin 又写了一份同样的兜底；九宫格的分组数、列数、行距全部写死在模板和样式里，后端配置一变就错位。再叠上三种调试底色和一段永远不生效的 `top`，这个模块更像一个还没收尾的施工现场。
