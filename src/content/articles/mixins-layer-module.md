---
title: 页面 mixins 层：16 个文件、三份 getUserInfo，和两个同名不同命的 social.js
description: 基于 pages/*/mixins 的真实源码，拆解这个横跨首页、论坛、我的三页却从没有名字的一层——同名 auth.js 只差两个等号、social.js 在两个页面里一个会回滚一个不会、首页下拉刷新要手工复位 14 个字段名、论坛一次请求失败就永久停翻页，以及搜索词会残留到下一次请求里。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, mixins, 代码质量]
chapter: foundation
order: 3
level: deep
featured: false
draft: false
project: robot-forum-miniapp
---

前面十八篇拆的是「一个页面」「一个业务模块」「一个工具文件」。这一篇拆一层从没有名字的东西：`pages/*/mixins/`。

一共 16 个文件，893 行，分散在三个页面目录下：

| 目录 | 文件数 | 行数 | 宿主页面 |
| --- | --- | --- | --- |
| `pages/index/mixins/` | 10 | 514 | 首页 |
| `pages/forum/mixins/` | 5 | 348 | 论坛 |
| `pages/mine/mixins/` | 1 | 31 | 我的 |

它是这个项目里唯一「一个功能一个文件」的层——首页的轮播、帖子流、新闻、活动、图标、弹窗、设置、用户信息各占一个 mixin，论坛的列表、发布、社交、红点、鉴权各占一个。

也正因为这样，它是全项目重复率最高的一层：同名文件在不同页面下各写了一份，三份 `getUserInfo` 各写了一份，加一个 mixin 还要回头改宿主页面的硬编码数组。

## 1. 用户要完成什么

用户不会知道 mixins 的存在，但下面这些行为全部由它决定：

| 用户动作 | 走到的 mixin | 用户看到 |
| --- | --- | --- |
| 打开首页 | `index/mixins/` 下 10 个同时发起 | 轮播、图标、活动、新闻各自到位；某个失败其余照常 |
| 首页下拉刷新 | `postList.js` + `index.vue` 的复位数组 | 全部模块重新拉一遍 |
| 切论坛标签 | `forum/mixins/getData.js` | 列表换成对应标签的内容 |
| 论坛点收藏 | `forum/mixins/social.js` | 收藏数 +1，失败会回滚并提示 |
| 首页点收藏 | `index/mixins/social.js` | 收藏数 +1，失败不回滚也不提示 |
| 进「我的」页 | `mine/mixins/member.js` | 会员等级条 |

最后一行的两个首页/论坛收藏看起来是同一个动作，但走的是两份同名文件、两套不同实现——这是这一层最值得看的地方。

## 2. 页面要怎么走

### 2.1 mixin 怎么挂上去

mixin 就是普通对象，Vue 合并它的 `data`、`methods`、`computed` 到宿主组件。首页挂了 10 个：

```js
// pages/index/index.vue:86-97
mixins: [
    swiperListMix,
    postListMix,
    newsListMix,
    socialMix,
    userInfoMix,
    activityListMix,
    iconsMix,
    popoverMix,
    swiperSettingMix,
    authMix
],
```

每个 mixin 的形状高度一致：`data()` 放自己的状态和 loading 锁，`methods` 里放一个 `getXxx()`。宿主页面只负责在生命周期里调它们。

### 2.2 首页每个模块自带一把锁

首页 10 个 mixin 里，有 7 个会发请求，它们的加载锁各写各的：

```js
// pages/index/mixins/postList.js:30-35
const now = Date.now()
// 锁超时强制释放：避免上次请求卡住锁导致本次跳过（首页数据加载不全）
if (this.loadingP && now - (this.loadingPTime || 0) < 5000) {
    return
}
this.loadingP = true;
this.loadingPTime = now;
```

模式是「布尔锁 + 时间戳 + 5 秒超时」。为什么要时间戳：注释写得很直接——`uni.request` 如果永远不回调，锁就永远不放，下次 `onShow` 直接 `return`，页面就再也刷不出数据了。5 秒后强制放行，是拿「可能重复请求」换「一定能恢复」。

这把锁的字段名在各 mixin 里是这样的：

| mixin | 锁字段 | 时间戳字段 |
| --- | --- | --- |
| `postList.js` | `loadingP` | `loadingPTime` |
| `swiperList.js` | `loadingS` | `loadingSTime` |
| `swiperSetting.js` | `loadingSS` | `loadingSSTime` |
| `icons.js` | `loadingI` | `loadingITime` |
| `activityList.js` | `loadingA` | `loadingATime` |
| `userInfo.js` | `loadingU` | `loadingUTime` |
| `newsList.js` | `loadingN` | `loadingNTime` |

`loadingS` 和 `loadingSS` 只差一个字母，指的却是两个不同的模块（轮播列表 / 轮播设置）。

超时阈值本身也有两种写法：`activityList.js` 和 `newsList.js` 用了模块级常量 `LOADING_TIMEOUT_MS = 5000`，其余五个直接写死字面量 `5000`。

### 2.3 首页首屏：并行，互不阻塞

十个模块的数据请求由 `easyFresh` 一起发起：

```js
// pages/index/index.vue:188-201
easyFresh() {
// 并行拉取，互不阻塞：单个失败不影响其他模块的渲染
// 修复"首页数据加载不全"：此前 fire-and-forget 链上任一 reject
// 都会阻断 easyFresh 后续调用，导致部分模块永远没数据
const tasks = [
    this.getUserInfo(),
    this.getActivityList(),
    this.getIconList(),
    this.getSwiperSetting(),
    this.getNewsList()
];
// 任一 Promise reject 都不会打断其他任务
Promise.allSettled(tasks).catch(() => {});
},
```

`Promise.allSettled` 是关键：换成 `Promise.all` 的话，一个接口失败会让其余几个的结果全部丢掉。现在每个 mixin 自己 `try/catch`，失败只让那一个模块空着。

（顺带一提，`.catch(() => {})` 这行是多余的——`allSettled` 返回的 Promise 永远不会 reject。）

### 2.4 论坛列表：锁写在页面 data 里

论坛不用 mixin 里的 `loadingX` 命名，改用页面自己的 `loading`：

```js
// pages/forum/mixins/getData.js:102-104
getList() {
    if (!this.loadAll && !this.loading) {
        this.loading = true;
```

这把锁没有超时释放机制。首页那 7 把锁都加了 5 秒兜底，论坛这把没有——请求如果悬着不返回，论坛的翻页就永久停住。

### 2.5 两份 auth.js，只差两个等号

首页和论坛各有一份 `auth.js`，做的是同一件事：检查 token 和昵称，用弹窗提示「当前操作需要登录」或「去完善」。

```js
// pages/forum/mixins/auth.js:23-34 与 pages/index/mixins/auth.js:23-34
modalConfirm() {
    if (this.modalInfo.confirmText == "去登录") {   // forum
    if (this.modalInfo.confirmText === "去登录") {  // index
        uni.navigateTo({
            url: "/pages/login/index"
        })
    } else if (this.modalInfo.confirmText == "去完善") {
    } else if (this.modalInfo.confirmText === "去完善") {
        uni.navigateTo({
            url: "/pages/register/index"
        })
    }
    this.modalShow = false;
}
```

逐行 diff 两个文件，只有两处不同：第 24 行和第 28 行的 `==` 换成了 `===`。35 行里其余 33 行完全一致。

### 2.6 两份 social.js，同名不同命

这一对才是真正的问题。同名文件、同名导出，但行为完全不同。

论坛版有 pending 锁、失败回滚、失败提示：

```js
// pages/forum/mixins/social.js:43-66
changeCollect(val) {
    if (this.checkAuth()) {
        const pendingKey = String(val.postId)
        if (this.socialCollectPending[pendingKey]) return
        this.socialCollectPending[pendingKey] = true
        this.store.changeCollect(val)
        const request = val.isFavorite == 1 ? collectApi({
            postId: val.postId
        }) : delCollectApi(val.postId)
        uni.showToast({
            title: val.isFavorite == 1 ? "收藏成功！" : "取消收藏",
            icon: "none"
        })
        request.catch((e) => {
            console.warn("changeCollect|fail", e && e.message)
            this.store.changeCollect(val)
            uni.showToast({
                title: "操作失败，请重试",
                icon: "none"
            })
        }).finally(() => {
            delete this.socialCollectPending[pendingKey]
        })
    }
}
```

首页版没有任何保护：

```js
// pages/index/mixins/social.js:20-32
changeCollect(val) {
    if (this.checkAuth()) {
        this.store.changeCollect(val)
        if (val.isFavorite == 1) {
            // fire-and-forget：乐观更新 UI 在前，失败不回滚（用户可再次点击）
            collectApi({
                postId: val.postId
            }).catch((e) => console.warn("collectApi|fail", e && e.message))
        } else {
            delCollectApi(val.postId)
                .catch((e) => console.warn("delCollectApi|fail", e && e.message))
        }
    }
}
```

差异清单：

| | 论坛版 | 首页版 |
| --- | --- | --- |
| 防重复点击 | `socialCollectPending` 锁 | 无 |
| 失败回滚 | 再调一次 `store.changeCollect` 翻转回去 | 无 |
| 失败提示 | 「操作失败，请重试」 | 只有 `console.warn` |
| 成功提示 | 「收藏成功！」/「取消收藏」 | 无 |

首页版首页瀑布流的卡片用的是 `mini-card`，它只 emit `changeCollect`，没有点赞入口，所以首页版的 `changeLike` 整段被注释掉了：

```js
// pages/index/mixins/social.js:10-19
// changeLike(val) {
// 	this.store.changeLike(val)
// 	if (val.isLike == 1) {
// 		likeApi({
// 			postId: val.postId
// 		})
// 	} else {
// 		delLikeApi(val.postId)
// 	}
// },
```

两份文件同名同目录结构（都在各自页面的 `mixins/` 下），改代码时如果照着另一份的逻辑去找，很容易改错地方。

### 2.7 getUserInfo 写了三份

同一件事，三个实现：

| 位置 | 行数 | 加载锁 | 超时兜底 | 额外动作 |
| --- | --- | --- | --- | --- |
| `pages/index/mixins/userInfo.js` | 62 | `loadingU` | 5 秒 | 调 `setVisitUserIdentity` |
| `pages/forum/mixins/getData.js` | 39-52 | 无 | 无 | 无 |
| `pages/mine/index.vue` | 102-123 | 页面 `loading` | 无 | 无 |

三份都调 `getUserInfoApi()`，都往 `useUserInfoStore` 里写一份。三份也都在失败时把 `this.userInfo` 兜底成 `{}` 或保留原值——但写法不一样：

```js
// pages/index/mixins/userInfo.js:51-53
} catch (e) {
    console.warn("[getUserInfo] fail", e && e.message)
    this.userInfo = this.userInfo || {};
```

```js
// pages/forum/mixins/getData.js:47-50
} catch (e) {
    console.warn("[forum.getUserInfo] fail", e && e.message)
    this.userInfo = {};
```

### 2.8 首页下拉刷新：手写 14 个字段名

页面自己维护了一份所有 mixin 锁字段的清单：

```js
// pages/index/index.vue:165-179
onPullDownRefresh() {
    this.loadAllP = false;
    this.queryDataP.pageNum = 1;
    // 复位所有 loading 锁的时间戳 + flag，使 mixin 内的"超时强制释放"立刻生效，
    // 避免上次请求未完成时本次下拉刷新被直接吞掉
    ['loadingP', 'loadingS', 'loadingI', 'loadingA', 'loadingU', 'loadingSS', 'loadingN'].forEach(k => {
        this[k] = false
    });
    ['loadingPTime', 'loadingSTime', 'loadingITime', 'loadingATime', 'loadingUTime', 'loadingSSTime', 'loadingNTime'].forEach(k => {
        this[k] = 0
    });
    this.getPostList();
    this.getSwiperList();
    this.getNewsList();
    this.easyFresh();
},
```

14 个字符串写死在页面里。加第 8 个会发请求的 mixin，就必须回来补这两行——忘了的话，那个模块在下拉刷新时会因为锁还是 `true` 而直接跳过，表现是「下拉了但那块没刷新」。

## 3. 空和失败怎么处理

这一层的失败处理有一个统一模式：**每个 mixin 自己 try/catch，失败只让那一个模块空着**。

```js
// pages/index/mixins/activityList.js:37-42
} catch (e) {
    console.warn("[activityList] fail", e && e.message)
    this.activityList = []
} finally {
    this.loadingA = false;
    this.loadingATime = 0
}
```

但有三处例外，行为和别处不一致。

### 3.1 论坛：一次失败，永久停翻页

```js
// pages/forum/mixins/getData.js:154-163
postListApi(searchData, this.queryParams).then(res => {
    this.stopLoading()
    this.showSocialTools = true;
    let list = res.rows;
    this.setListData(res, list)
}).catch(err => {
    this.stopLoading()
    this.loadAll = true;
})
```

`loadAll = true` 是「已经到底了」的标记。请求失败时也把它置 true，等于把「拉取失败」当成「没有更多了」——用户再怎么上拉都不会再请求，而且没有任何提示。首页那 7 个 mixin 的 catch 里都是把列表置空、锁复位，从不碰 `loadAll`，两边的失败语义完全相反。

### 3.2 论坛：搜索词会残留

`getList()` 每次重置 `searchData` 时，只清了四个字段：

```js
// pages/forum/mixins/getData.js:105-108
this.searchData.popularPost = "";
this.searchData.tag = ""
this.searchData.userId = ""
this.searchData.isFavorite = ""
```

而搜索关键词写在第五个字段上：

```js
// pages/forum/index.vue:144-154
search(postTitle) {
    this.loadAll = false;
    this.queryParams.pageNum = 1;
    this.searchData.postTitle = postTitle;
    this.getList();
},
```

`postTitle` 从来没被清过。于是：用户搜「张三」→ 切到「热门」标签 → 请求里仍然带着 `postTitle=张三`，列表只剩标题含张三的帖子，而且用户不知道为什么。切标签、切搜索、下拉刷新都不会清掉它。

### 3.3 论坛 tabs：父页面直接改子组件内部状态

```js
// pages/forum/mixins/getData.js:31-38
changeTab() {
    const tabName = uni.getStorageSync("tabName")
    if (tabName == "post") {
        this.$refs['tabs'].current = 2 + this.tags.length;
    } else if (tabName == "collect") {
        this.$refs['tabs'].current = 3 + this.tags.length;
    }
}
```

`2` 和 `3` 是写死的偏移量，依赖 `tabs` 组件内部 `_list` 的固定结构（「所有帖子」「热门」+ N 个标签 +「我的帖子」「我的收藏」）。`tabs` 组件的 `_list` 一旦调整顺序或增删固定项，这里的 `2`/`3` 就全错，而且不会报错——只会选中一个错的标签。

### 3.4 我的页：失败也写 store

```js
// pages/mine/index.vue:104-119
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
```

`catch` 里只打日志，`this.userInfo` 保持原值（首次进入是 `{}`），而第 118 行无条件把它写进 store。也就是说接口失败时，store 里也会被写入一份空用户信息。首页 mixin 的写法是失败时兜底后照样写，论坛 mixin 则是在 `try` 内部写、失败不写——三份又是三种语义。

## 4. 界面为什么要这样排版

mixins 层本身不画界面，但它决定了首屏的顺序感和加载表现。

### 4.1 一个模块失败，整块消失而不是留骨架

首页每个模块的失败兜底都是把数据置空，模板再按长度决定渲不渲染：

```html
<!-- pages/index/index.vue:13-24 -->
<JActivityList v-if="activityList.length > 0" :list="activityList" @clickCard="toActivity" />

<!-- 最新动态（官网新闻） -->
<view v-if="newsList.length > 0" class="news-section">
```

活动接口挂了就整块不出现，新闻接口挂了就整块不出现——不留空容器、不留转圈、不显示错误提示。好处是首屏不会有一堆空块；代价是用户完全不知道「这部分本来有内容」。

### 4.2 加载中的禁用态挂在论坛的 tabs 上

```html
<!-- pages/forum/index.vue:5 -->
<JTabs :tags="tags" @change="changeTag" :disabled="loading" ref="tabs" />
```

`loading` 为真时整个 tab 栏不可点。这是「请求中禁止切换」的常见做法，但也意味着用户点标签的时机和请求结束强相关——请求慢，标签就点不动。

### 4.3 会员等级：失败时保留旧值

```js
// pages/mine/mixins/member.js:16-27
const res = await memberLevelApi()
if (res && res.data) {
    try {
        this.memberLevel = JSON.parse(res.data);
    } catch (e) {
        console.warn("[member.getMemberLevel] JSON.parse fail", e && e.message)
    }
}
```

接口返回的 `data` 是一段 JSON 字符串，要 `JSON.parse` 一次。解析失败时只打日志，`this.memberLevel` 保持上次的值——等级条不会突然消失。这和首页「失败即置空」是两种取向：会员等级是「有就更新，没有就沿用」，首页模块是「没有就不渲染」。

### 4.4 轮播：过滤掉访客页专属头图

```js
// pages/index/mixins/swiperList.js:51-53
// 排除 bannerId=6 的访客页专属头图，避免首页轮播重复展示
list = list.filter(item => Number(item.bannerId) !== 6)
```

`Number(...)` 而不是 `item.bannerId != 6`，因为后端这个字段有时是数字有时是字符串。这类「同一个字段两种类型」的判断在这一层里出现过多次。

## 5. 代码怎么落地

### 5.1 文件清单与调用关系

```
pages/index/index.vue ─ 挂 10 个 mixin
  ├─ swiperList.js      getSwiperList()  → swiperListApi
  ├─ swiperSetting.js   getSwiperSetting() → swiperSettingApi（JSON 字符串）
  ├─ postList.js        getPostList()    → postListApi → store.setIndexPostList → waterFlow.init/add
  ├─ newsList.js        getNewsList()    → newsListApi（官网 PHP）+ 缓存 10 条到 storage
  ├─ activityList.js    getActivityList()→ activityListApi
  ├─ icons.js           getIconTypes() / getIconList() → iconTypesApi / allIconsApi
  ├─ popover.js         getPopoList()    → popoverListApi → $refs.popover.show()
  ├─ userInfo.js        getUserInfo()    → getUserInfoApi + setVisitUserIdentity
  ├─ social.js          changeCollect()  → collectApi / delCollectApi（无回滚）
  └─ auth.js            checkAuth() / modalConfirm()

pages/forum/index.vue ─ 挂 5 个 mixin
  ├─ getData.js         getList() / getTabs() / getUserInfo() → postListApi / collectListApi
  ├─ social.js          changeCollect() / changeLike() → 有 pending 锁 + 回滚
  ├─ auth.js            checkAuth() / modalConfirm()
  ├─ dot.js             checkHasReadHot() → getHostList() + storage hotIds
  └─ publish.js         publish(obj)    → addPostApi

pages/mine/index.vue ─ 挂 1 个 mixin
  └─ member.js          getMemberLevel() → memberLevelApi
```

### 5.2 改动这一层时按这个顺序

1. **先确认改的是哪一份**。`auth.js` 和 `social.js` 各有两份，行为不同。
2. **加 mixin 必改首页 `onPullDownRefresh`**。新锁字段要同时加进那两个 `forEach` 数组。
3. **锁的超时阈值统一走常量**，别再写第五次字面量 `5000`。
4. **新 mixin 的 catch 不要碰 `loadAll`**。那是「到底了」，不是「失败了」。
5. **重置 `searchData` 要连 `postTitle` 一起清**。
6. **`getUserInfo` 收敛成一个**。三份实现、三种失败语义，留两份迟早会漂移。

### 5.3 记录的真实问题

| # | 问题 | 位置 |
| --- | --- | --- |
| 1 | 首页与论坛各有一份 `auth.js`，35 行中 33 行逐字相同，只差第 24、28 行的 `==` / `===` | `index/mixins/auth.js:24,28`、`forum/mixins/auth.js:24,28` |
| 2 | 首页与论坛各有一份 `social.js`，同名不同行为：论坛有 pending 锁 + 失败回滚 + 提示，首页无锁、无回滚、无提示 | `index/mixins/social.js:20-32`、`forum/mixins/social.js:43-66` |
| 3 | 首页 `social.js` 的 `changeLike` 整段注释保留，首页瀑布流卡片确实无点赞入口 | `index/mixins/social.js:10-19` |
| 4 | 首页下拉刷新靠页面里写死的 14 个字段名复位所有 mixin 的锁；新增会发请求的 mixin 必须回头改这两处，漏改则该模块下拉不刷新 | `pages/index/index.vue:170-175` |
| 5 | 锁超时阈值两种写法并存：`activityList.js`、`newsList.js` 用 `LOADING_TIMEOUT_MS` 常量，其余五处直接写 `5000` | `activityList.js:10,25`、`newsList.js:5,26`、`postList.js:31`、`swiperList.js:41`、`swiperSetting.js:16`、`userInfo.js:28`、`icons.js:26` |
| 6 | `loadingS`（轮播列表）与 `loadingSS`（轮播设置）只差一个字母，字段名无法自解释 | `swiperList.js:12-13`、`swiperSetting.js:8-9` |
| 7 | 论坛 `getList` 请求失败时把 `loadAll` 置 true，等于把「失败」当「没有更多」，翻页永久停止且无提示 | `forum/mixins/getData.js:160-163` |
| 8 | 论坛 `getList` 重置 `searchData` 时漏掉 `postTitle`，搜索词会残留到之后的切标签、翻页、下拉刷新请求里 | `forum/mixins/getData.js:105-108`、`pages/forum/index.vue:148` |
| 9 | 论坛的 `getList` 用页面 `loading` 布尔锁，没有 5 秒超时释放；首页 7 把锁都有，论坛这把没有 | `forum/mixins/getData.js:103-104` |
| 10 | `getUserInfo` 三份实现：锁、超时兜底、失败语义（清空 / 保留 / 保留后仍写 store）各不相同 | `index/mixins/userInfo.js:24-61`、`forum/mixins/getData.js:39-52`、`pages/mine/index.vue:102-123` |
| 11 | `changeTab` 通过 `$refs` 直接改 `tabs` 子组件内部 `current`，偏移量 `2`/`3` 写死并依赖 tabs 固定结构；结构一变就静默选错标签 | `forum/mixins/getData.js:31-38`、`components/tabs/index.vue:37-55` |
| 12 | `Promise.allSettled(...)` 后接 `.catch(() => {})` 是死代码，`allSettled` 返回的 Promise 永不 reject | `pages/index/index.vue:200` |
| 13 | 首页 `getNewsList` 在 `onLoad` 与 `easyFresh` 中各调一次、`onShow` 同样各调一次，靠 5 秒锁挡住第二次 | `pages/index/index.vue:149,161,197` |
| 14 | `dot.js` 的 `hotIds` 只增不减，每次有新帖都 `[...newIds, ...idsStor]` 拼接，storage 里的数组无限增长 | `forum/mixins/dot.js:31-34` |
| 15 | `getTagListApi`、`popoverListApi`、`memberLevelApi` 三个函数声明了 `(data, params)` 形参却全部忽略，硬传 `{}` | `api/index.js:32-34,164-166,184-186` |
| 16 | `store/post.js` 与 `store/userInfo.js` 的文件头注释都是 `// store/counter.js`，且 post store 的 id 就是 `'counter'` | `store/post.js:1,58`、`store/userInfo.js:1,6` |

### 5.4 验证

- `npm test`：9 个测试文件、136 项全部通过。
- `npm run check`：92 个文件，0 error / 0 warning / 0 hint。
- `npm run build`：Pagefind 索引 87 页，构建无报错。
- `npm run test:build`：构建冒烟 22 项通过。
- 产物：`dist/articles/mixins-layer-module/index.html`、`dist/og/articles/mixins-layer-module.png`。

这一层没有一行渲染代码，却决定了首页首屏能不能一次填满、论坛的列表会不会误判「到底了」、以及用户在搜索之后能不能看到不相关的结果。它的问题也不是「写得不对」，而是「同一个东西被拆成了 16 个文件，却没有一份清单告诉别人每个文件里有什么、和别人重不重」。
