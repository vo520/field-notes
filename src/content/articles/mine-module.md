---
title: 个人中心：四块数据、一条负边距的会员条，和三个各写一遍的登录提示
description: 基于 pages/mine 与 mine-card / mine-info / vip-box / mine-cells / cell 六个组件、620 行真实源码，拆解个人中心的四段拼装：会员等级由前端按发帖数算、登录提示有三份不同文案、跳转分发靠中文字符串比较、跨页切 tab 用 storage 传参、请求失败只留一个「匿名用户」。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 个人中心, 代码质量]
chapter: pages
order: 4
level: practice
featured: false
draft: false
project: robot-forum-miniapp
---

个人中心是底部 tab 的最后一格，页面本身只有 133 行，真正的内容全在四个子组件里。

加起来 620 行：`pages/mine/index.vue` 133 行，`mine-card` 104 行，`mine-info` 99 行，`vip-box` 150 行，`mine-cells` 35 行，`cell` 67 行，外加拉会员配置的 `pages/mine/mixins/member.js` 32 行。

这一篇要拆的是四个问题：会员等级是怎么算出来的、三处登录提示为什么文案不同、切 tab 为什么要绕 storage、以及请求失败时页面只剩「匿名用户」这一条路。

## 1. 用户要完成什么

| 用户动作 | 走到的代码 | 用户看到 |
| --- | --- | --- |
| 进「我的」 | `onLoad` → `init()` → `getUserInfo` + `getMemberLevel` | 蓝色头图、头像昵称、四个计数、会员条 |
| 点头像/昵称 | `toLogin` → 有 token 去 `/pages/register/index`，没有去 `/pages/login/index` | 「个人信息」页或登录页 |
| 点「帖子」「收藏」 | 写 storage `tabName` → `switchTab` 到论坛 | 论坛停在「我的帖子」/「我的收藏」 |
| 点「获赞」「评论」 | `navigateTo` 到点赞列表 / 评论列表 | 对应列表页 |
| 点会员条 | `toIntegral` → 有 token 去积分页；没有先 toast 再跳登录 | 积分页 / 登录页 |
| 点四行菜单 | `mine-cells` 上抛 → 页面按标题分发 | 访客记录 / 常见问题 / 关于我们 / 登录设置 |
| 下拉 | `onPullDownRefresh` → `init()` | 刷新头像昵称与计数 |

三个入口都指向同一个 `init()`（`pages/mine/index.vue:66-80`）：`onLoad`、`onShow`、`onPullDownRefresh`。它只做三件事——取 token、拉用户资料、拉会员配置。

## 2. 页面要怎么走

### 2.1 四段拼装

```html
<!-- pages/mine/index.vue:2-8 -->
<view class="mine">
    <JMineCard :info="userInfo" :token="token" />
    <JMineInfo :info="userInfo" />
    <JVipBox :info="userInfo" :memberLevel="memberLevel" :token="token" />
    <JMineCells @clickCell="clickCell" />
</view>
```

三块蓝色区域加一块白底菜单，顺序不能换：`mine-card` 的底色是 `#0047bb`，`mine-info` 也是 `#0047bb`，`vip-box` 靠 `margin-top: -80rpx` 骑在两块的交界线上，`mine-cells` 是 `#F6F6F6` 背景下的白卡片。

页面只传 `userInfo` 和 `token` 两个状态，四个子组件没有一个自己发请求——除了会员配置，它是页面通过 `member` mixin 拉的。

### 2.2 会员等级是前端算出来的

会员条上的「普通会员 / 白银会员 / 黄金会员」和背景图，都由 `postsCount` 和一份后端配置比出来：

```js
// components/vip-box/index.vue:48-60
memberName() {
    let res = "普通会员"
    if (this.memberLevel.gold) {
        if (this.info.postsCount >= this.memberLevel.gold) {
            res = "黄金会员"
        } else if (this.info.postsCount >= this.memberLevel.silver) {
            res = "白银会员"
        } else if (this.info.postsCount >= this.memberLevel.ordinary || 0) {
            res = "普通会员"
        }
    }
    return res;
}
```

`bgImg` 是同一套阈值再抄一遍（`vip-box:61-73`），只是把结果换成 `vip1.png / vip2.png / vip3.png`。也就是说，等级判断在同一个文件里写了两遍。

配置来自 `memberLevelApi()`，`get('/biz/config/key/member', {}, false)`（`api/index.js:184-186`），第三个参数 `false` 表示不需要登录。mixin 拿到响应后做了一次 `JSON.parse`：

```js
// pages/mine/mixins/member.js:17-23
if (res && res.data) {
    try {
        this.memberLevel = JSON.parse(res.data);
    } catch (e) {
        console.warn("[member.getMemberLevel] JSON.parse fail", e && e.message)
    }
}
```

这意味着后端必须把配置序列化成字符串返回。如果哪天改成直接返回对象，`JSON.parse` 会抛错，被 catch 吞掉，页面不会报错，只是所有人的会员条都停在「普通会员」。

### 2.3 四个计数

`mine-info` 用四列 grid 摆四个数：

```js
// components/mine-info/index.vue:31-46
list() {
    let res = [{
        name: "帖子",
        num: convertToWanUnit(this.info.postsCount || 0)
    }, {
        name: "收藏",
        num: convertToWanUnit(this.info.favoritesCount || 0)
    }, {
        name: "获赞",
        num: convertToWanUnit(this.info.likesCount || 0)
    }, {
        name: "评论",
        num: convertToWanUnit(this.info.commentsCount || 0)
    }]
    return res;
}
```

单位换算在 `tools/util.js:240-245`：大于等于一万才转 `x.x万`，否则原样返回数字。所以「9999」和「1.0万」会同时存在，宽度不统一，但四列 grid 保证了对齐。

### 2.4 跳转按中文标题分发

四个计数点下去走哪，是在组件里按 `item.name` 的中文字符串比的：

```js
// components/mine-info/index.vue:49-69
clickItem(item) {
    if (item.name == "获赞") {
        uni.navigateTo({ url: `/pages/like-list/index` })
    } else if (item.name == "评论") {
        uni.navigateTo({ url: `/pages/comment-list/index` })
    } else if (item.name == "帖子") {
        uni.setStorageSync("tabName", "post")
        uni.switchTab({ url: `/pages/forum/index` })
    } else if (item.name == "收藏") {
        uni.setStorageSync("tabName", "collect")
        uni.switchTab({ url: `/pages/forum/index` })
    }
}
```

页面对四行菜单用的是同样的办法，比的是 `item.title`（`pages/mine/index.vue:81-101`）。`mine-cells` 里的列表也是中文字面量（`mine-cells:18-26`），两处必须保持一致。没有 `default` 分支，也没有兜底提示——改一个字的文案，功能就静默失效。

### 2.5 跨页切 tab 靠 storage

「帖子」「收藏」要跳到论坛并停在对应 tab，但 `switchTab` 不能带参数，于是用 storage 中转：

写入方在 `mine-info`，读取方在论坛页：

```js
// pages/forum/index.vue:132-143
initTab() {
    let change = false;
    const tabName = uni.getStorageSync("tabName")
    if (tabName == "post" && this.tabName != "我的帖子") {
        this.tabName = "我的帖子"
        change = true;
    } else if (tabName == "collect" && this.tabName != "我的收藏") {
        this.tabName = "我的收藏"
        change = true;
    }
    return change
}
```

论坛页在 `onHide` 里把它删掉（`pages/forum/index.vue:112-114`），保证这个「一次性指令」不会在你的下一次切 tab 时又被执行一遍。

另一条消费路径更脆：`pages/forum/mixins/getData.js:31-38` 的 `changeTab()` 直接给 `$refs.tabs.current` 赋下标：

```js
if (tabName == "post") {
    this.$refs['tabs'].current = 2 + this.tags.length;
} else if (tabName == "collect") {
    this.$refs['tabs'].current = 3 + this.tags.length;
}
```

`2` 和 `3` 是「我的帖子」「我的收藏」在 tag 列表之后的位置，写死的。标签数量一变，这两个下标就指向别的 tab。

### 2.6 头像与昵称

`mine-card` 同时渲染两张头像图，用 `v-show` 互斥：

```html
<!-- components/mine-card/index.vue:3-4 -->
<image :src="info.avatar" mode="aspectFill" class="head" v-show="info.avatar"></image>
<image :src="emptyHead" mode="aspectFill" class="head" v-show="!info.avatar"></image>
```

昵称则取决于 `token` 和 `nickName` 两个条件（`mine-card:45-54`）：没 token 显示「未登录」，有 token 但没昵称显示「匿名用户」。

点击整个卡片进 `toLogin()`：有 token 去 `/pages/register/index`（页面标题是「个人信息」，实际是资料编辑页），没有 token 去登录页。

## 3. 空和失败怎么处理

### 3.1 未登录

`init()` 里 `this.token = getToken()`，`getUserInfo()` 一看没有 token 就把 `userInfo` 置空，不发请求：

```js
// pages/mine/index.vue:120-122
} else {
    this.userInfo = {};
}
```

于是头图显示默认头像 + 「未登录」，四个计数全是 0，会员条是「普通会员 · 0 积分」。没有一个组件的空态是独立设计的，全部依赖「空对象 + 默认值」自然退化。

### 3.2 请求失败

有 token 时，资料请求失败只打一行 warn：

```js
// pages/mine/index.vue:106-116
try {
    let res = await getUserInfoApi();
    let data = (res && res.data) || {};
    data.avatar = fixImgUrl(data.avatar)
    this.userInfo = data;
} catch (e) {
    console.warn("[mine.getUserInfo] fail", e && e.message)
} finally {
    this.loading = false;
    uni.stopPullDownRefresh();
}
```

catch 不赋任何值，`userInfo` 保持上一次的样子——首次进页时就是 `{}`，界面显示「匿名用户」。用户看到的是一个登录着、但昵称叫「匿名用户」的账号。

### 3.3 失败还会清掉全局 store

同一个方法的末尾，不管成功失败，都把当前 `userInfo` 写进 pinia：

```js
// pages/mine/index.vue:117-118
const userInfoStore = useUserInfoStore();
userInfoStore.userInfo = this.userInfo;
```

这段在 `try/finally` 之后、`if (!this.loading)` 之内，所以失败时写进去的是空对象，会把首页刚写入的真实资料覆盖掉。而全项目对 `userInfoStore.userInfo` 只有三处写入（首页、论坛、我的），没有一处读取——这个 store 目前是只写状态，覆盖不会立刻显现，但它也解释不了「资料从哪来」。

### 3.4 会员配置失败

`getMemberLevel` 的 catch 同样只 warn（`member.js:24-26`），`memberLevel` 保持 `{}`。`vip-box` 里第一个判断是 `if (this.memberLevel.gold)`，配置为空时整段跳过，直接返回「普通会员」和 `vip1.png`。等级条不会消失，也不会提示，只是永远是最低档。

### 3.5 三个 login 提示

这是这个模块最典型的重复。同一个「需要登录」的拦截，项目里有三份实现：

| 位置 | 文案 | 细节 |
| --- | --- | --- |
| `tools/util.js:175-202` `needLogin` | 「此操作需要登录」 | 有 `doing` 锁，有 `icon: "none"` |
| `tools/util.js:37-55` `toLoginNeedToken` | 「当前操作需要登录」 | 有 `doing` 锁，有 `icon: "none"` |
| `components/vip-box/index.vue:76-93` 内联 | 「当前操作需要登录」 | 没有锁，没写 `icon` |

前两个至少共用了一个模块级 `doing` 变量互相排重；`vip-box` 这份是独立写的，连点会员条就会连续压入多个登录页——`setTimeout` 的 1500ms 内每点一次都排一个跳转。

三份实现里，文案还不一样：「此操作」和「当前操作」。

### 3.6 未登录时下拉刷新不回收

`stopPullDownRefresh()` 只写在有 token 分支的 `finally` 里（`pages/mine/index.vue:113-115`）。走 `else` 分支时没有任何地方调用它，下拉动画的收尾交给平台自己处理。

### 3.7 积分与等级是两回事

会员条左侧是等级，右侧是积分，点击整条却只跳积分页。等级按发帖数算，积分按 `totalPoints` 显示，`totalPoints` 缺失时兜底为 0（`vip-box:10`）。两个数字在同一个视觉容器里，但没有换算关系。

## 4. 界面为什么要这样排版

### 4.1 上半蓝下半白

导航栏背景是 `#0047bb`（`pages.json:30-36`），页面背景是 `#F6F6F6`。`mine-card`、`mine-info`、`vip-box` 三块都用同一个蓝，视觉上和导航栏连成一片，形成「品牌区」；`mine-cells` 才是白底功能区。

### 4.2 会员条要「浮」在分界线上

```scss
// components/vip-box/index.vue:99-105
.vip-box {
    padding: 0 12rpx;
    margin-top: -80rpx;
    z-index: 99;
    position: relative;
}
```

负边距把会员条往上提 80rpx，骑在蓝白交界处。为了不让它压住四个计数，`mine-info` 的底部内边距是 130rpx：

```scss
// components/mine-info/index.vue:80
padding: 30rpx 40rpx 130rpx;
```

130 减 80，剩 50rpx 的呼吸空间。这两个数字分别写在两个组件里，没有任何变量或注释说明它们是一对——改一个，另一个就错位。

### 4.3 四列计数

`grid-template-columns: 1fr 1fr 1fr 1fr`（`mine-info:77-78`），数字 36rpx / 700 字重，名称 28rpx，整体居中。四个指标等宽，视觉重量一致，扫一眼就能读完。

### 4.4 菜单行

`cell` 的规则是：最小高度 90rpx、左右内边距 44rpx、右侧箭头绝对定位、分割线用 `scaleY(0.5)` 压到半像素（`cell:31-66`）。这套数值是小程序里「设置列表」的通用观感，比默认 1px 线细，也和微信原生列表接近。

但 `mine-cells` 只传了 `item` 和 `border`，从没传过 `content`（`mine-cells:4`），所以每行右侧的内容区永远是空字符串加 36rpx 右外边距——一段一直存在、但永远用不上的留白。

## 5. 代码怎么落地

### 5.1 结构

```
pages/mine/index.vue          133  页面：三入口 init、按标题分发、头像外链
pages/mine/mixins/member.js    32  会员配置：JSON.parse + 静默降级
components/mine-card/         104  头像昵称：双图互斥、点击分流登录/资料
components/mine-info/          99  四列计数：单位换算、按中文名跳转
components/vip-box/           150  会员条：等级/背景双份阈值、未登录 toast
components/mine-cells/         35  菜单容器：四行字面量
components/cell/               67  菜单行：90rpx 行高、半像素分割线
```

### 5.2 阅读顺序

1. `pages/mine/index.vue:57-80`——先看 `data` 和 `init()`，搞清页面只有三个状态：`userInfo`、`token`、`memberLevel`。
2. `mine/index.vue:102-123`——`getUserInfo` 是整个模块唯一的数据来源，注意 catch、finally、store 三段的顺序。
3. `mine-card:44-68`——头像昵称的三态和点击分流，最短的一段，但它定义了「未登录」在页面上的样子。
4. `mine-info:30-70`——四个数字从哪来、点下去去哪，顺带看 storage 传参。
5. `vip-box:47-95`——两套一模一样的阈值判断，以及第三份登录提示。
6. `member.js:12-30` 和 `api/index.js:184-186`——配置怎么拿、为什么必须返回字符串。
7. `mine-cells` + `cell`——菜单为什么右侧永远空着。
8. `pages/forum/index.vue:112-143` + `getData.js:31-38`——storage 指令的另一端，注意写死的 `2 + tags.length`。

### 5.3 真实问题

| # | 问题 | 位置 |
| --- | --- | --- |
| 1 | 未登录时下拉刷新不调 `stopPullDownRefresh`，`else` 分支直接置空返回 | `pages/mine/index.vue:102-123` |
| 2 | 资料请求失败只 warn，界面退回「匿名用户」，登录态与展示态不一致 | `pages/mine/index.vue:111-112` |
| 3 | 失败也会把空 `userInfo` 写入 pinia，覆盖首页写入的真实资料 | `pages/mine/index.vue:117-118` |
| 4 | `userInfoStore` 全项目只有三处写入、零处读取，是只写状态 | `mine/index.vue:117`、`index/mixins/userInfo.js:46`、`forum/mixins/getData.js:45` |
| 5 | 会员等级与会员背景图两套完全重复的阈值判断，改档位要改两处 | `components/vip-box/index.vue:48-73` |
| 6 | `this.info.postsCount >= this.memberLevel.ordinary \|\| 0` 优先级为 `(a>=b) \|\| 0`，与上两档写法不一致 | `components/vip-box/index.vue:55,68` |
| 7 | 会员配置强依赖 `JSON.parse` 字符串；后端改返回对象则静默降级为普通会员 | `pages/mine/mixins/member.js:19-22` |
| 8 | 第三份登录提示：无 `doing` 锁、无 `icon: "none"`，连点可压多个登录页 | `components/vip-box/index.vue:76-93` |
| 9 | 三份登录拦截文案不一致：「此操作需要登录」/「当前操作需要登录」 | `tools/util.js:175-202,37-55`、`vip-box:82-84` |
| 10 | 跳转分发按中文标题字符串比较，无 `default` 分支，改文案即静默失效 | `components/mine-info/index.vue:49-69`、`pages/mine/index.vue:81-101` |
| 11 | 论坛 tab 下标写死 `2 + tags.length` / `3 + tags.length`，标签数量变化就错位 | `pages/forum/mixins/getData.js:31-38` |
| 12 | 负边距靠 80rpx 与 130rpx 两个魔法数字对齐，分散在两个组件里 | `vip-box:103`、`mine-info:80` |
| 13 | 头像双图 `v-show` 互斥；而 `fixImgUrl` 已对空值返回默认头像，等于两份兜底 | `components/mine-card/index.vue:3-4`、`tools/util.js:29-31` |
| 14 | 路由名 `register` 实为「个人信息」编辑页，点头像即进资料页 | `pages.json:61-67`、`mine-card:57-67` |
| 15 | `cell` 的 `content` 从未传入，右侧留白永久空置；行无点击反馈 | `components/mine-cells/index.vue:4`、`components/cell/index.vue:2-10` |
| 16 | `vip-box` 里 `vip1Img/vip2Img/vip3Img` 已注释，import 仍保留 | `components/vip-box/index.vue:17-19,41-43` |
| 17 | `onShareAppMessage` 返回空 `title`，分享卡片无标题 | `pages/mine/index.vue:35-48` |

### 5.4 验证

- `npm test`：10 个测试文件、147 项全部通过。
- `npm run check`：95 个文件，0 error / 0 warning / 0 hint。
- `npm run build`：Pagefind 索引 95 页，构建无报错。
- `npm run test:build`：构建冒烟 22 项通过。
- 产物：`dist/articles/mine-module/index.html`、`dist/og/articles/mine-module.png`。

个人中心的界面本身没有难点，问题都在「状态从哪来」这件事上：资料只靠一次请求、失败不重试不留缓存、会员等级前端算、切 tab 靠 storage 一次性指令。这些做法在演示阶段都成立，一旦网络抖动或多账号切换，症状就是「匿名用户」「等级不动」「点帖子跳错 tab」这类不报错的怪现象。
