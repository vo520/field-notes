---
title: 我的与积分：四块拼图里藏着三个分页 bug
description: 基于 uni-app 小程序「我的」模块的真实代码，拆解个人信息卡、四项统计、会员等级条、积分规则与积分明细、获赞与评论列表的加载、分页、空态和已知缺陷。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 积分, 工程实践]
chapter: pages
cover: /images/chapters/pages.svg
order: 5
level: practice
featured: false
draft: false
project: robot-forum-miniapp
---

「我的」模块由四个页面组成：`pages/mine/index`（我的）、`pages/integral/index`（用户积分）、`pages/integral-detail/index`（积分详情）、`pages/like-list/index`（获赞）、`pages/comment-list/index`（评论）。

它比首页简单，但代码里留了几个很典型的「复制粘贴后遗症」：分页方法引用了一个不存在的 `this.rows`、两个列表的排序字段名不一致、积分明细要靠 `pageNum--` 补偿。这些都不是猜测，读源码就能直接看到。

## 1. 用户要完成什么

- 看自己的头像、昵称、发帖数、收藏数、获赞数、评论数；
- 点统计数字，跳到对应的帖子流、收藏流、获赞列表、评论列表；
- 看自己的会员等级和总积分；
- 点进积分页，查看积分规则、每条规则的完成进度、总积分和积分明细；
- 从「我的」进入访客预约记录、常见问题、关于我们、登录设置。

这个模块没有「提交」类操作，全是查看和跳转。所有数据都来自 `GET /system/user/profile`，一次拿全。

## 2. 页面要怎么走

### 我的：三个生命周期都调同一个 `init`

```js
onLoad() { this.init(); },
onShow() { this.init(); },
onPullDownRefresh() { this.init(); },
init() {
  this.token = getToken();
  this.getUserInfo();
  this.getMemberLevel();
}
```

`onShow` 也刷新，是因为用户可能刚在「个人信息」页改了昵称或头像，返回时必须更新。`init` 不等待、不合并，两个请求并发发出。

`getUserInfo()` 先判断 token：

```js
async getUserInfo() {
  if (getToken()) {
    if (!this.loading) {
      this.loading = true;
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
      const userInfoStore = useUserInfoStore();
      userInfoStore.userInfo = this.userInfo;
    }
  } else {
    this.userInfo = {};
  }
}
```

没有 token 时直接置空，不发请求；有 token 时，无论成功失败都会把当前 `userInfo` 写进 Pinia。注意这个 `loading` 只是普通重入锁，没有首页那种 5 秒超时——接口挂住时，下拉刷新会被一直吞掉，只是 `stopPullDownRefresh` 在 `finally` 里还能把动画收掉。

`getMemberLevel()` 在 `mixins/member.js` 里，请求 `GET /biz/config/key/member`，`auth` 传 `false`。返回的 `data` 是 JSON 字符串，代码做了两层 `try`：

```js
const res = await memberLevelApi()
if (res && res.data) {
  try {
    this.memberLevel = JSON.parse(res.data);
  } catch (e) {
    console.warn("[member.getMemberLevel] JSON.parse fail", e && e.message)
  }
}
```

解析失败就保持 `{}`，组件里所有阈值判断都走默认分支，页面不会崩。

### 四个组件各管一段

| 组件 | 职责 | 点击去向 |
| --- | --- | --- |
| `JMineCard` | 头像、昵称、右侧箭头 | 有 token → `register`（个人信息），无 token → `login` |
| `JMineInfo` | 帖子 / 收藏 / 获赞 / 评论 四项统计 | 见下表 |
| `JVipBox` | 会员等级条、总积分 | 有 token → `integral`，无 token 提示后去登录 |
| `JMineCells` | 四行功能入口 | 按 `title` 分流 |

`JMineInfo` 的跳转全靠标题字符串：

```js
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
```

帖子和收藏都是社区 tab，靠 storage 里的 `tabName` 告诉论坛页切到哪个子 tab。这是跨 tab 传参的常见做法——`switchTab` 不支持 query。

`JMineCells` 的四项里，只有「访客预约记录」包了 `needLogin`，其余三项（常见问题、关于我们、登录设置）匿名也能进。登录设置页本身不做登录校验，未登录时点「退出登录」只是删一个不存在的 token。

### 积分页：两个并发请求，无 loading

```js
onLoad() {
  this.sysInfo = uni.getSystemInfoSync();
  this.getUserInfo();
  this.getPointers();
}
```

`getUserInfo()` 拉 `GET /system/user/profile` 取 `totalPoints`；`getPointers()` 拉 `GET /biz/pointsRules/pointsRulesWithUserUsage`（`auth: true`）取规则列表。两个请求都没有 loading 状态，也没有锁，失败只 `console.warn`。

「积分规则」是另一个接口：`GET /biz/config/key/integralRuleText`，返回的是 URI 编码的富文本，代码先 `decodeURIComponent`，再交给 `rich-text` 渲染：

```js
const res = await integralRuleTextApi()
if (res && res.data) {
  this.document = decodeURIComponent(res.data)
  this.$refs.integralPopup.showPopup = true;
}
```

`data` 为空时什么都不发生——不弹空弹窗，也不提示。

### 积分明细 / 获赞 / 评论：三种分页写法

三个列表页都是「首屏拉一页 + 触底追加 + 下拉重置」，但实现各不相同：

| 页面 | pageSize | 排序字段 | 追加方式 |
| --- | --- | --- | --- |
| 积分明细 | 20 | 无（后端默认） | `pageNum == 1` 时覆盖，否则 `push` |
| 获赞 | 20 | `create_time` | `type == "push"` 时追加 |
| 评论 | 10 | `created_time` | 同上 |

积分明细用页码判断走哪个分支，并在到底时把页码减回去：

```js
if (rowsLen < this.queryData.pageSize || this.pointList.length >= (res.total || 0)) {
  this.loadAll = true;
  this.queryData.pageNum--;
}
```

减回去是为了防止「触底一次没追加、再触底又加一页」导致跳页。获赞和评论页没有这个补偿，只靠 `loadAll` 拦住后续触发。

## 3. 空和失败怎么处理

### 三个真实的 bug

**1. 获赞 / 评论的第二页永远加载不出来。**

```js
if (type == "push") {
  this.rows.map(item => {
    this.likeList.push(item)
  })
} else {
  this.likeList = res.rows || [];
}
```

`this.rows` 在 `data()` 里从未定义，`res.rows` 才是接口返回值。执行到 `this.rows.map` 会抛 `TypeError`，被外层 `catch` 吞掉，只打印一条 `[like-list.getList] fail`。表现是：首屏 20 条（评论 10 条）正常，上拉之后没有任何新内容，`loadAll` 也不会变成 `true`，底部一直显示「加载中」。两个页面是同一份模板复制出来的，所以错误也一起复制了。

**2. 两个列表的排序字段名不一致。**

获赞页传 `orderByColumn: "create_time"`，评论页传 `orderByColumn: "created_time"`。同一个后端的表字段不可能同时叫两个名字，至少有一处是笔误。代码里没有任何注释说明差异，只能标记为待核对；如果后端做了字段白名单，其中一个请求可能直接报错，而错误同样被 `catch` 吞成一行日志。

**3. 积分明细的 `pageNum--` 会掩盖「重新进入页面」的语义。**

到底时页码减一，`loadAll` 为真，页面不再请求。这本身没问题，但如果将来加了「从详情返回后刷新」，`pageNum` 已经不是 1，首屏覆盖分支不会命中，列表会残留旧数据再追加。现在的代码没有这个场景，属于潜在坑，不是线上问题。

### 空态

- 我的页无 token：`userInfo = {}`，卡片显示「未登录」，统计数字全部走 `|| 0` 显示 0，会员条显示「普通会员」和「0积分」。
- 有 token 但没昵称：显示「匿名用户」；没头像：显示 `head-empty.jpg`。
- 统计数字超过一万：`convertToWanUnit` 转成 `x.x万`，例如 `12345` → `1.2万`。
- 积分规则列表为空：页面只剩「总积分」「积分规则」两行，没有空态提示。
- 获赞 / 评论列表为空：`loadAll` 置真，底部显示「没有更多」，但列表区域完全空白，没有插画或文案。
- 积分明细为空：同上，只有一条「没有更多」。
- 积分弹窗：`document` 为空时不弹，避免出现只有遮罩的空白层。
- 会员配置缺失：`memberLevel` 为 `{}` 时，`memberName` 保持「普通会员」，`bgImg` 保持 `vip1.png`。

### 失败

所有请求失败都只 `console.warn`，不弹全局错误。好处是不会出现「进页面连弹三个 toast」；代价是用户分不清「没有数据」和「请求失败」，两者长得一样。

`stopPullDownRefresh` 放在 `getUserInfo` 的 `finally` 里，所以下拉动画一定能收掉；但积分页和两个列表页在下拉时，如果请求抛错，`stopPullDownRefresh` 依赖各自的调用方——获赞 / 评论页写在 `onPullDownRefresh` 的 `await` 之后，接口抛错会跳过后面的 `stopPullDownRefresh()`，下拉动画可能一直转。

## 4. 界面为什么这样排版

### 用一块连续的蓝色做「身份区」

`JMineCard` 和 `JMineInfo` 的背景都是 `#0047bb`，中间没有间隔：

```scss
.mine-card { background: #0047bb; padding: 40rpx; }
.mine-info { background: #0047bb; padding: 30rpx 40rpx 130rpx; }
```

`mine-info` 底部留了 `130rpx`，是为了给下面的会员条让位——`vip-box` 用 `margin-top: -80rpx` 压上来：

```scss
.vip-box {
  margin-top: -80rpx;
  padding: 0 12rpx;
  z-index: 99;
  position: relative;
}
```

这样头像昵称、四项数据、会员条连成一个整体蓝色头部，下面的功能列表才是灰底白卡。整页 `page` 背景是 `#F6F6F6`，和首页的 `#FCFCFC` 不同，因为这里需要更明显的卡片边界。

四项统计用四列 grid 而不是 flex：

```scss
.mine-info {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
}
```

数字 `36rpx / 700`，标签 `28rpx`，上下两行居中。固定四列保证数字位数变化时不会把其他项挤歪。

### 积分页：白底、行式布局

积分页导航是白底黑字（`pages.json` 里 `navigationBarBackgroundColor: #ffffff`），和「我的」的蓝底白字不同。因为这一页是「账单」语义，需要阅读大量文字和数字，白底更合适。

- 第一行「总积分」右侧显示 `totalPoints`；
- 第二行「积分规则」右侧留空，整行可点；
- 中间一条加粗分隔线（`divider/bold.vue`）；
- 下面是规则列表，每行左侧规则名 + 蓝底积分标签，右侧「去完成 / 已完成」按钮，底部一行进度。

积分标签用的是 `lighten(#0047bb, 40%)`，不是写死的色值：

```scss
.point {
  font-size: 24rpx;
  background: lighten(#0047bb, 40%);
  color: #fff;
  padding: 0 10rpx;
}
```

这样品牌蓝调整时，标签会自动跟着变。按钮是胶囊形（`border-radius: 24rpx`），禁用态变成白底灰边灰字，和可点击态形成强对比。

### 0.5px 分隔线

所有列表行都用伪元素画线，而不是 `border-bottom`：

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

`1px + scaleY(0.5)` 在 2 倍屏上得到 0.5px 的物理细线，比直接 `1px` 更接近设计稿。`left/right: 44rpx` 让线不顶到屏幕边，和行内文字左边距对齐；`fullBorder` 时改成 0，用于积分明细这种整行通栏列表。

### 互动列表的三栏结构

`interact-item` 是固定左中右：

```scss
.lf { width: 80rpx; height: 80rpx; }   /* 头像 */
.cnt { width: 0; flex: 1; padding: 0 24rpx; }  /* 文本 */
.rt { width: 120rpx; height: 120rpx; }  /* 帖子缩略图 */
```

中间列必须写 `width: 0`，否则 flex 子项默认 `min-width: auto`，长评论会把右侧缩略图挤出去。头像 `border-radius: 40rpx` 做成正圆，缩略图用 `aspectFit` 保证不变形。

获赞和评论共用一个组件，靠 `type` 切文案：评论显示评论内容，获赞显示「赞了你的帖子」。右侧缩略图如果后缀是视频则不显示，避免出现一个视频首帧的空白占位。

### 积分弹窗

`up-popup` 从底部弹出、圆角 10、可关闭。内容高度不是写死的，而是取安全区高度的 70%：

```js
popupInnerStyle() {
  let height = 0;
  if (this.sysInfo.safeArea) {
    height = this.sysInfo.safeArea.height
  }
  return { 'height': `${height * 0.7}px` }
}
```

内层 `padding: 90rpx 40rpx 32rpx`，顶部 90rpx 是给右上角关闭按钮留的位置，避免富文本第一行被遮住。

## 5. 代码怎么落地

### 组件与接口

| 页面 / 组件 | 接口 | 鉴权 |
| --- | --- | --- |
| 我的 | `GET /system/user/profile` | 是 |
| 会员配置 | `GET /biz/config/key/member` | 否 |
| 积分页 | `GET /system/user/profile`、`GET /biz/pointsRules/pointsRulesWithUserUsage` | 后者是 |
| 积分规则文案 | `GET /biz/config/key/integralRuleText` | 否 |
| 积分明细 | `GET /biz/points/selectCurrentUserPoints` | 是 |
| 获赞列表 | `POST /biz/like/currentUserList` | 接口声明为否 |
| 评论列表 | `POST /biz/comments/currentUserList` | 接口声明为否 |

获赞和评论接口虽然声明 `auth: false`，但请求拦截器只要 storage 里有 token 就会带上 `Authorization`，所以登录用户依然能拿到自己的数据；未登录时请求会由后端返回空列表或 401，代码里没有额外守卫。

### 会员等级由发帖数决定

会员条的名字和背景图都不看积分，而是看 `postsCount` 落在哪个区间：

```js
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

阈值 `ordinary / silver / gold` 全部来自后台配置，前端不写死。最后那个 `|| 0` 看着像想兜底，实际因为 `>=` 优先级更高，`|| 0` 只作用在布尔结果上，起不到默认值作用；不过三个分支的结果都是「普通会员」，所以目前不影响显示。

背景图同一套判断，分别对应 `vip1.png / vip2.png / vip3.png`。数据里 `totalPoints` 才是积分，和等级无关——这在产品语义上容易误解，代码注释也没解释，属于需要产品确认的点。

### 跨页面的用户信息同步

`store/userInfo.js` 是一个极简 Pinia store，只有 `userInfo` 一个字段。我的页在 `getUserInfo` 成功后写入：

```js
const userInfoStore = useUserInfoStore();
userInfoStore.userInfo = this.userInfo;
```

首页的用户卡、发帖页的作者信息都读这一份。这样在「个人信息」页保存后返回首页，不需要重新请求就能看到新昵称。代价是：无 token 分支只把页面内的 `userInfo` 置空，没有清 Pinia，如果用户刚退出登录又没刷新首页，首页可能还显示上一个账号的头像。这是一个真实存在的边界，目前靠首页 `onShow` 重新拉取来覆盖。

### 分享的统一写法

我的、积分、积分明细、获赞、评论五个页面都复制了同一段 `onShareAppMessage`：

```js
const pages = getCurrentPages();
const page = pages[pages.length - 1];
const route = page && page.route ? page.route : "";
const options = page && page.options ? page.options : {};
const query = Object.keys(options)
  .filter(k => options[k] !== undefined && options[k] !== null && options[k] !== "")
  .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(options[k]))}`)
  .join("&");
return { title: "", path: "/" + route + (query ? "?" + query : "") };
```

它不是拼业务参数，而是把当前页面原样转发。`title` 留空让微信用默认小程序名。五个页面各自复制一份，没有抽成 mixin——从维护角度看这是可以合并的重复代码。

### 分页模板

积分明细的结构最完整，可以作为这个项目的标准写法：

```js
async getPointList() {
  if (!this.loading && !this.loadAll) {
    this.loading = true;
    try {
      const res = await pointRecordApi(this.queryData)
      if (this.queryData.pageNum == 1) {
        this.pointList = res.rows || [];
      } else {
        this.pointList.push(...(res.rows || []));
      }
      const rowsLen = (res.rows || []).length;
      if (rowsLen < this.queryData.pageSize || this.pointList.length >= (res.total || 0)) {
        this.loadAll = true;
        this.queryData.pageNum--;
      } else {
        this.loadAll = false;
      }
    } catch (e) {
      console.warn("[integral-detail.getPointList] fail", e && e.message)
    } finally {
      this.loading = false;
    }
  }
}
```

三个判据缺一不可：`loading` 防并发、`loadAll` 防到底后继续请求、`rowsLen < pageSize` 和 `length >= total` 双条件处理「刚好整页」和「后端 total 不准」两种情况。

获赞和评论页本来也应该是这套逻辑，只是追加分支写错成了 `this.rows`。如果要修，最小改动是把两处 `this.rows.map(...)` 换成 `this.likeList.push(...res.rows)`，顺便把 `orderByColumn` 统一成后端真实字段名。

---

「我的」模块的界面部分很稳定：一块蓝色头部、四列统计、一条会员条、四行入口。真正容易出问题的是列表分页——三个列表、三套写法、两个还带着复制过来的错误。看这类代码时，先看 `catch` 里是不是只剩一行 `console.warn`，基本就能判断哪些失败是「设计如此」，哪些是「被吞掉了」。
