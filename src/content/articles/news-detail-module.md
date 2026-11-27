---
title: 新闻详情页：三步正则洗一段官网 HTML，和一条要回首页刷过才存在的「上下篇」
description: 基于 pages/news/detail.vue 408 行真实源码，拆解这个只读的官网新闻详情页——CMS 吐出的整段 HTML 怎么塞进 rich-text、图片预览为什么只认 /media 路径、上下篇为什么依赖首页写进 storage 的 10 条快照、两行页脚为什么点了做同一件事，以及失败时正在读的文章怎么被整页换成错误页。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 新闻详情, 代码质量]
chapter: community
order: 6
level: deep
featured: false
draft: false
project: robot-forum-miniapp
---

前面拆过两种详情页：帖子详情有点赞、收藏、评论和分享奖励，活动详情有报名和访客预约。这一篇是第三种——官网新闻详情。

它跟前面两种没有共享任何东西：数据不来自业务后端，直接打 `www.dobot.cn` 的 PHP 接口；正文不是字段拼出来的，而是 CMS 吐出的一整段 HTML；页面上没有一个互动按钮。

408 行，模板 71 行、脚本 155 行、样式 178 行。真正需要解释的只有三件事：一段不可控的 HTML 怎么塞进 `rich-text`、上一篇下一篇从哪来、以及为什么页脚两行点了做同一件事。

## 1. 用户要完成什么

| 用户动作 | 页面行为 | 用户看到 |
| --- | --- | --- |
| 在首页「最新动态」点一张卡片 | `toNews` 取 `item.id` 跳 `pages/news/detail?id=` | 新闻详情，白色导航栏 |
| 读正文 | `rich-text` 渲染清洗后的 `contentHtml` | 标题、日期、摘要卡、正文 |
| 看正文里的图 | 「查看全部 N 张图片」→ `uni.previewImage` | 全屏图片浏览器，从第一张开始 |
| 点「查看官网原文」 | `setClipboardData(officialUrl)` | toast「官网链接已复制」 |
| 点「复制文章链接」 | `setClipboardData(officialUrl)` | toast「链接已复制」 |
| 读上一篇 / 下一篇 | 从 storage 缓存列表取相邻两条 | 原地换文章，滚回顶部 |
| 转发给好友 | `onShareAppMessage` | 文章标题 + 正文第一张图 |

这一页没有登录判断。`newsDetailApi` 第三个参数传 `false`，请求层不挂 token；页面里也没有 `checkAuth`。

也没有评论、点赞、收藏。这三样在整个项目里都挂在论坛的 `postId` 上（`api/index.js` 的 `likeApi`、`collectApi` 都只收 `postId`），官网新闻拿不到这个 id，页面干脆不提供入口。

## 2. 页面要怎么走

### 2.1 入口只有一个，列表靠 storage 传一半

首页的新闻卡片只 emit 一个 `clickCard`，页面拿 `item.id` 跳走：

```js
// pages/index/index.vue:223-232
toNews(item) {
    // PHP CMS 文章 id（数字）
    const articleId = item && item.id
    if (articleId) {
        uni.navigateTo({ url: `/pages/news/detail?id=${articleId}` })
    }
}
```

但详情页要显示「上一篇/下一篇」，光有一个 id 不够，得知道列表顺序。于是首页的 news mixin 顺手把 10 条新闻写进 storage：

```js
// pages/index/mixins/newsList.js:9-12
const NEWS_LIST_KEY = 'offical_news_list_v1'
// 首页显示条数 vs 缓存条数（缓存多取点方便上下篇）
const DISPLAY_COUNT = 5
const CACHE_COUNT = 10
```

请求成功后整表覆盖（`newsList.js:53-57`），详情页 `onLoad` 只读一次（`detail.vue:151-158`）。

这就是这一页最重要的隐式契约：**「上下篇」不是详情页自己查出来的，是首页刷过一次之后留在本地的快照**。它只有 10 条，没有过期时间，除了 key 里的 `v1` 没有版本号。

### 2.2 接口绕开了请求层的两点

```js
// api/index.js:145-151
export const newsDetailApi = (id) => {
	return get(
		'https://www.dobot.cn/api.php',
		{ controller: 'MiniApi', act: 'detail', id },
		false
	)
}
```

第三个数 `false` 是 `auth`，表示不带 token；第一个参数是绝对地址，luch-request 拼 URL 时遇到绝对地址就不接 `baseURL`（`buildFullPath.js:16`）。这是全项目唯一不走 `baseUrl + prefix` 的接口。

第四个数 `toast` 没传，默认 `true`（`request.js:74`）。而响应拦截器在 `code !== 200` 时已经先弹过一次 toast 再 reject（`request.js:47-57`）。所以接口失败时，用户会同时收到请求层的「请求失败」和页面里的「内容加载失败」。

### 2.3 首屏三态

模板就是三个分支：`loading` 时占位、`detail` 有值时渲染正文、其余走空态。

```html
<!-- pages/news/detail.vue:3-7 -->
<view v-if="loading" class="loading-wrap">
    <up-loading-icon text="加载中" size="40"></up-loading-icon>
</view>

<block v-else-if="detail">
```

加载态是 `height: 60vh` 的居中转圈（`detail.vue:238-243`），不是骨架屏。因为正文高度不可预知，骨架屏画出来也跟真实排版对不上。

### 2.4 正文：三步正则

`content_full` 是官网富文本编辑器产出的 HTML，带死宽高、带 `/media/` 相对路径。直接塞进 `rich-text`，图片会裂、会被原图尺寸撑破屏。所以有一个 computed 专门洗：

```js
// pages/news/detail.vue:98-114
contentHtml() {
    const d = this.detail || {}
    let html = d.content_full || ''
    if (!html) return ''
    // 1. 补全图片相对路径
    html = html.replace(/(src=["'])(\/media\/[^"']+)(["'])/g, `$1${OFFICIAL_SITE}$2$3`)
    // 2. img 标签：去 width/height 属性 + 去原始 style + 换自适应 style
    html = html.replace(/<img\b([^>]*?)(\s*\/)?\s*>/gi, (match, attrs) => {
        let cleaned = attrs
            .replace(/\s+(width|height)\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\s+style\s*=\s*["'][^"']*["']/gi, '')
        return `<img${cleaned} style="display:block;max-width:100%;width:100%;height:auto;margin:16rpx 0;" />`
    })
    // 3. 去 <p> 上的 width 样式
    html = html.replace(/<p([^>]*)style=["'][^"']*width[^"']*["']/gi, '<p$1')
    return html
}
```

三步各解决一个具体问题：

1. **补前缀**。只处理 `src="/media/..."`，把官网域名拼上去，否则小程序里没有基址，相对路径直接裂图。
2. **重写 img**。删掉原 HTML 的 `width`、`height`、`style`（编辑器常写死 `width:800px`），统一换成满宽自适应。
3. **去 p 的 width**。CMS 常给段落写 `style="width:100%"`，在 `rich-text` 里会把行宽锁死。

三步都是全局正则，没有解析 DOM——小程序端也没有 DOM 可解析。

### 2.5 图片清单和预览

`rich-text` 里的图片没有点击事件，所以页面另给了一个入口：只要正文里有图，就显示「查看全部 N 张图片」。

清单是另起一条正则从原始 HTML 里抽的：

```js
// pages/news/detail.vue:116-128
bodyImages() {
    const d = this.detail || {}
    const html = d.content_full || ''
    const urls = []
    const re = /src=["']((?:https?:\/\/[^"']*?\/media\/[^"']*)|(?:\/media\/[^"']*))["']/gi
    let m
    while ((m = re.exec(html)) !== null) {
        let url = m[1]
        if (!url.startsWith('http')) url = OFFICIAL_SITE + url
        if (!urls.includes(url)) urls.push(url)
    }
    return urls
}
```

注意它读的是**未清洗**的 `content_full`，而不是 `contentHtml`。两个 computed 各自把同一段 HTML 扫一遍。

预览时 `current` 固定传第一张（`detail.vue:196`），用户点按钮永远从第一张开始翻——因为按钮只知道自己被点了，不知道用户想看哪张。

### 2.6 上下篇：缓存、严格相等、方向

```js
// pages/news/detail.vue:136-149
currentIndex() {
    if (!this.cachedList.length || !this.newsId) return -1
    return this.cachedList.findIndex(item => item.id === this.newsId)
},
// 缓存列表按时间倒序（最新在前 [0]）
// 上一篇（更旧的）= index+1，下一篇（更新的）= index-1
prevArticle() {
    if (this.currentIndex < 0 || this.currentIndex >= this.cachedList.length - 1) return null
    return this.cachedList[this.currentIndex + 1]
},
nextArticle() {
    if (this.currentIndex <= 0) return null
    return this.cachedList[this.currentIndex - 1]
}
```

列表是最新在前，所以「上一篇」取 `index+1`（更旧）、「下一篇」取 `index-1`（更新）。名字和方向对得上，但读代码时得先记住这个倒序前提。

`currentIndex` 用的是 `===`。左边 `this.newsId` 是 `onLoad` 里 `parseInt` 出来的 number（`detail.vue:152`），右边是 CMS 缓存的 `item.id`，类型取决于 PHP 那边怎么序列化 JSON。两边一旦不同型，`findIndex` 返回 `-1`，整块上下篇直接不渲染，也不报错。

翻页是原地换 id，不 push 新页面：

```js
// pages/news/detail.vue:213-226
goPrev() {
    if (!this.prevArticle) return
    this.newsId = this.prevArticle.id
    this.detail = null
    this.loadDetail()
    uni.pageScrollTo({ scrollTop: 0, duration: 200 })
},
```

好处是连续读 5 篇不会堆 5 层页面栈。代价是系统返回键直接回首页，不是回上一篇。

`pageScrollTo` 紧跟在 `loadDetail()` 后面，没有 `await`。此刻 `detail` 刚被置空，页面只剩 loading 占位的高度，滚动到底也就是回到顶部——行为正确，但靠的是「内容变短自动贴顶」而不是这次调用。

### 2.7 分享：这一页没抄那 13 行

项目里 18 个页面写着同一段分享代码：

```js
// pages/about-us-detail/index.vue:13-29（pages/post、pages/index 等 17 处逐字相同）
onShareAppMessage() {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    const route = page && page.route ? page.route : "";
    const options = page && page.options ? page.options : {};
    const query = Object.keys(options)
        .filter(k => options[k] !== undefined && options[k] !== null && options[k] !== "")
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(options[k]))}`)
        .join("&");
    return {
        title: "",
        path: "/" + route + (query ? "?" + query : "")
    };
}
```

它读的是 `page.options`，也就是 `onLoad` 那一刻的参数快照。新闻页不抄这段，自己拼：

```js
// pages/news/detail.vue:165-172
onShareAppMessage() {
    const d = this.detail || {}
    return {
        title: d.title || '官网新闻',
        path: `/pages/news/detail?id=${this.newsId}`,
        imageUrl: this.bodyImages[0] || ''
    }
}
```

这恰好是对的。翻了上一篇之后，`newsId` 已经变了，但 `page.options.id` 还是进页面时那个值——用通用片段会把「当前正在读的文章」分享成「进来时那篇」。这一页是唯一有「页内换实体」行为的详情页，所以也只有它不能复用那段。

### 2.8 页脚两行，同一个动作

```js
// pages/news/detail.vue:199-212
openOfficial() {
    if (!this.officialUrl) return
    uni.setClipboardData({
        data: this.officialUrl,
        success: () => uni.showToast({ title: '官网链接已复制', icon: 'none' })
    })
},
copyLink() {
    if (!this.officialUrl) return
    uni.setClipboardData({
        data: this.officialUrl,
        success: () => uni.showToast({ title: '链接已复制', icon: 'none' })
    })
}
```

两行的文案是「查看官网原文」和「复制文章链接」，一个暗示打开网页、一个暗示复制小程序链接，实际都只往剪贴板写 `officialUrl`。

项目里其实有 `pages/webview/index.vue`，但它不接参数，从 storage 的 `webviewUrl` 取值（`pages/webview/index.vue:27-29`），这一页也没往那个 key 里写过东西。要真打开官网，还得先写入 storage 再跳转。

## 3. 空和失败怎么处理

### 3.1 没带 id 进来

```js
// pages/news/detail.vue:159-163
if (this.newsId) {
    this.loadDetail()
} else {
    this.loading = false
}
```

`loading` 置 false、`detail` 仍是 null，页面落到空态：「内容加载失败」+ 蓝色「重试」按钮。但用户根本没发过请求——是链接缺了 id。

而且这个「重试」按钮调的是同一个 `loadDetail`：

```js
// pages/news/detail.vue:174-177
async loadDetail() {
    this.loading = true
    try {
        const res = await newsDetailApi(this.newsId)
```

`newsId` 是 null，请求照样发出去，`id=null`。点几次，发几次。

### 3.2 拉取失败：正在读的文章被整页换掉

```js
// pages/news/detail.vue:178-190
if (res && res.code === 200 && res.data) {
    this.detail = res.data
    const title = res.data.title ? res.data.title.slice(0, 15) : '官网新闻'
    uni.setNavigationBarTitle({ title })
} else {
    this.detail = null
}
} catch (e) {
    console.warn('[newsDetail] fail', e && e.message)
    this.detail = null
}
```

失败时 `detail = null`，模板的 `v-else-if="detail"` 不成立，整篇正文连同上下篇一起被换成空态。用户点「下一篇」时网络断了，丢掉的是他刚才正在看的那篇。

导航栏标题只在成功分支里改。翻页失败时，页面已经变成「内容加载失败」，标题栏还停在上一篇文章的标题上（`detail.vue:180-181`）。

`res.code === 200` 这个判断其实多余：响应拦截器已经把非 200 全 reject 了（`request.js:47-57`），能走到这行的只有 200 或 401 的原始对象。

### 3.3 没有请求锁：乱序会覆盖

`loadDetail` 里没有「进行中就直接返回」，也没有请求序号。用户点「下一篇」再马上点「上一篇」，两个请求同时在飞：

- `newsId` 先变成 B，再变回 A；
- 若 A 的响应先到、B 的响应后到，`detail` 最终是 B 的内容；
- 但 `newsId` 停留在 A，`currentIndex` 指向 A，上下篇按 A 算。

结果是正文是 B、标题是 B、上一页下一页按 A 排。整个函数唯一的保护是 `finally` 里的 `loading = false`，它只保证转圈会停。

### 3.4 从分享链接直接进来

这是最常见的落地路径，也是上下篇最容易消失的路径。`onLoad` 读 storage，如果这台设备从没打开过首页、或首页新闻请求失败过（`newsList.js:58-60` 失败时只清列表，不写缓存），`cachedList` 是空数组：

- `currentIndex` 返回 -1；
- `prevArticle`、`nextArticle` 都返回 null；
- 模板的 `v-if="prevArticle || nextArticle"` 不成立，整块导航不渲染。

用户看到的就是一篇孤零零的文章，不知道还有没有别的新闻——页面也不提示「更多新闻」。

### 3.5 空值边界

| 字段 | 为空时 | 结果 |
| --- | --- | --- |
| `description` | `summary` 返回空串 | 摘要卡整块不渲染（`detail.vue:19`） |
| `views` | `v-if="detail.views"` | 0 或字段不存在时，「阅读 N」消失，meta 行只剩日期（`detail.vue:15`） |
| `content_full` | `contentHtml` 返回空串 | 正文区留白，页面不报错 |
| `bodyImages` | 空数组 | 预览按钮不渲染；分享的 `imageUrl` 为空串 |
| `my_url` | `officialUrl` 返回空串 | 页脚两行点击直接 return，没有任何反馈（`detail.vue:200,207`） |

最后一行值得单说：`my_url` 缺失时按钮还在，点了没反应，也没有 toast。它看起来是「可点但坏了」，而不是「不可用」。

## 4. 界面为什么要这样排版

### 4.1 白底黑字，和其他页反过来

其他页面的导航栏是品牌蓝底白字，这一页是白底黑字：

```json
// pages.json:47-53
{
    "path": "pages/news/detail",
    "style": {
        "navigationBarTitleText": "官网新闻",
        "navigationBarBackgroundColor": "#ffffff",
        "navigationBarTextStyle": "black"
    }
}
```

因为页面本身是 `background: #fff`（`detail.vue:234`）。阅读页要的是纸感，品牌蓝只留在摘要卡的左边框、预览按钮文字和上下篇箭头上。整个页面里 `#0047bb` 出现三次，都是引导性元素，不是大面积色块。

### 4.2 尺度：标题紧、正文松

| 元素 | 字号 | 行高 | 颜色 |
| --- | --- | --- | --- |
| 标题 | 40rpx / bold | 1.5 | `#1a1a1a` |
| 元信息 | 24rpx | 默认 | `#9aa0ab` |
| 摘要 | 26rpx | 1.7 | `#4a5568` |
| 正文 | 30rpx | 1.85 | `#2d3748` |

正文行高 1.85 明显大于信息流的 1.4~1.5，字号却只比摘要大 4rpx。这是长文阅读的常规取舍：先加行距，再加字号，否则一屏字数掉得太快。

### 4.3 摘要卡：把「编辑写的」和「CMS 吐的」分开

```scss
// pages/news/detail.vue:295-305
.summary {
    display: block;
    margin-top: 28rpx;
    padding: 24rpx 28rpx;
    background: #f5f6fa;
    border-left: 6rpx solid #0047bb;
    border-radius: 4rpx;
    font-size: 26rpx;
    color: #4a5568;
    line-height: 1.7;
}
```

灰底 + 左侧 6rpx 蓝条，视觉上是一段「编者按」。它必须和正文区分开，因为正文的样式不可控——里面可能有自己的标题、引用、表格、配色，如果摘要也是一段普通段落，读者分不清哪段是站方写的。

### 4.4 `rich-text` 的边界决定了两个额外 UI

`rich-text` 是独立渲染树，页面的 scoped 样式进不去，正文里的字号、行距只能靠外层 `.content` 容器继承（`detail.vue:307-313`）。这带来两个后果：

1. **图片样式只能写进 HTML**。所以第 2 步正则必须把 `style` 直接塞到每个 `<img>` 上，而不是在 scoped 里写 `.content img`。
2. **图片无法绑点击**。所以要有「查看全部 N 张图片」这个按钮——它不是设计上的加法，是平台能力的补丁。

### 4.5 上下篇：箭头方向就是阅读方向

「上一篇」的箭头在左、文字左对齐；「下一篇」箭头在右、整块右对齐（`detail.vue:371-378`）。两个卡片都占满宽，靠对齐方向区分，不靠颜色。

`nav-bar` 写在 `.body` 外面，自己给 `16rpx 32rpx 32rpx` 的外边距（`detail.vue:358-361`），和 `.body` 的 `padding: 32rpx` 对齐。这样分割线能横贯整屏，而卡片仍然有边距。

### 4.6 空态：一个 emoji、一句话、一个按钮

```html
<!-- pages/news/detail.vue:64-70 -->
<view v-else class="empty">
    <text class="empty-icon">😔</text>
    <text class="empty-text">内容加载失败</text>
    <view class="empty-retry" @tap="loadDetail">
        <text>重试</text>
    </view>
</view>
```

高度 60vh，和加载态一致——所以从「加载中」切到「失败」时，页面不会跳一下。重试按钮是蓝色胶囊（`detail.vue:262-269`），和摘要卡左边框、上下篇箭头同一个蓝。

## 5. 代码怎么落地

### 5.1 文件与调用关系

```
pages/index/index.vue
  ├─ JNewsCard (components/news-card)  emit clickCard
  ├─ toNews(item)                      → /pages/news/detail?id=item.id
  └─ newsList mixin                    → newsListApi → storage['offical_news_list_v1'] = 10 条

pages/news/detail.vue
  ├─ onLoad                            → 读 storage['offical_news_list_v1'] → cachedList
  ├─ loadDetail()                      → newsDetailApi(id)（绝对 URL / 无 token）
  ├─ contentHtml                       → 三步正则清洗 content_full
  ├─ bodyImages                        → 从 content_full 抽 /media/ 图片
  ├─ prevArticle / nextArticle         → cachedList 相邻项
  ├─ previewAllImages()                → uni.previewImage(urls, current: urls[0])
  ├─ openOfficial() / copyLink()       → uni.setClipboardData(officialUrl)
  └─ onShareAppMessage                 → { title, path: /pages/news/detail?id=newsId, imageUrl }
```

### 5.2 读这一页按这个顺序

1. **先确认数据从哪来**。这一页不走 `baseUrl + prefix`，日志里搜不到业务接口的请求。接口失败先看 `www.dobot.cn` 是否可达，不要先查 token。
2. **改正文渲染只动 `contentHtml`**。模板里只有一个 `<rich-text :nodes="contentHtml">`，不要往模板里加 `::v-deep` 样式——进不去。
3. **改图片清单要同步改两条正则**。`contentHtml` 第 1 步和 `bodyImages` 各有一条 `/media/` 规则，只改一处会出现「图能显示但预览里没有」或反过来。
4. **上下篇调试先看 storage**。`offical_news_list_v1` 为空、或里面的 `id` 类型与 `newsId` 不同型，导航都不渲染，且没有任何日志。
5. **改 key 要同时改两个文件**。`detail.vue:80` 和 `newsList.js:9` 各写了一份字面量。
6. **加翻页保护时别只加 loading**。要防的是乱序覆盖，需要请求序号或 `AbortController` 类的机制，布尔锁只能防重复点击。

### 5.3 记录的真实问题

| # | 问题 | 位置 |
| --- | --- | --- |
| 1 | 无 id 进入时直接落到「内容加载失败」，重试按钮继续用 `null` 发请求，点几次发几次 | `pages/news/detail.vue:67-69,151-163,174-177` |
| 2 | 拉取失败把 `detail` 置 null，正在阅读的正文连同上下篇一起被换成空态；导航栏标题仍停在旧文章 | `pages/news/detail.vue:182-187,180-181` |
| 3 | `loadDetail` 无并发锁、无请求序号，快速点上/下篇会乱序覆盖：正文是 B、`newsId` 是 A | `pages/news/detail.vue:174-191,213-226` |
| 4 | 上下篇依赖首页写入的 storage 快照，只有 10 条、无 TTL、无版本；从分享链接首次进入或首页新闻失败过，导航整块消失且无提示 | `pages/news/detail.vue:151-158,136-149`、`pages/index/mixins/newsList.js:12,53-60` |
| 5 | `currentIndex` 用 `===` 比较 `parseInt` 后的 number 与缓存 `item.id`；两边不同型时静默返回 -1 | `pages/news/detail.vue:138,152` |
| 6 | `NEWS_LIST_KEY`、`OFFICIAL_SITE`，以及 `my_url`/`image1` 的相对路径补全，在详情页与首页 mixin 各写一份 | `pages/news/detail.vue:79-80,133`、`pages/index/mixins/newsList.js:7,9,41-48` |
| 7 | 页脚两行点击都只复制 `officialUrl`，只有 toast 文案不同；「查看官网原文」并不打开官网 | `pages/news/detail.vue:34-41,199-212` |
| 8 | 「复制文章链接」复制的是官网 URL，不是小程序路径；转发走 `?id=`，两条链路不一致 | `pages/news/detail.vue:206-210,165-172` |
| 9 | 摘要直接插值 `description`，不去标签不解码；同一 CMS 的 `content_small` 在 news-card 里有 15 行实体解码 | `pages/news/detail.vue:19,93-96`、`components/news-card/index.vue:29-50` |
| 10 | 第 1 步正则只补 `/media/` 开头的 src，其他相对路径原样进入 `rich-text`，在小程序里没有基址可用 | `pages/news/detail.vue:103` |
| 11 | `bodyImages` 同样只认 `/media/`：绝对路径但不在 `/media/` 下的图能显示，却不计入「N 张」、不能预览、也不当分享封面 | `pages/news/detail.vue:120` |
| 12 | 分享封面取正文第一张图，不用接口返回的封面字段 `image` | `pages/news/detail.vue:170`、`api/index.js:147` |
| 13 | 第 3 步正则删的是整个 `style` 属性，注释说「去 width」；`<p style="width:100%;text-align:center">` 会连居中一起丢 | `pages/news/detail.vue:112` |
| 14 | 第 2 步给所有 `<img>` 统一加 `width:100%`，正文里本来小的图（图标、二维码）也被拉满 | `pages/news/detail.vue:105-110` |
| 15 | 导航栏标题 `slice(0, 15)` 无省略号，按 UTF-16 截断可能切断代理对；失败时标题不回退 | `pages/news/detail.vue:180` |
| 16 | 只有 `onShareAppMessage`，全项目 0 处 `onShareTimeline`；朋友圈分享无法带自定义标题和封面 | `pages/news/detail.vue:165` |
| 17 | `views` 用 `v-if` 判断，接口注释列出的字段里没有 `views`；不返回则永不显示，返回 0 也整行消失 | `pages/news/detail.vue:15`、`api/index.js:146-147` |
| 18 | 失败时请求层（`toast` 默认 true）和页面空态各提示一次，同一次失败两条反馈 | `tools/request.js:47-57,74`、`pages/news/detail.vue:64-70` |

### 5.4 验证

- `npm test`：10 个测试文件、144 项全部通过。
- `npm run check`：93 个文件，0 error / 0 warning / 0 hint。
- `npm run build`：Pagefind 索引 89 页，构建无报错。
- `npm run test:build`：构建冒烟 22 项通过。
- 产物：`dist/articles/news-detail-module/index.html`、`dist/og/articles/news-detail-module.png`。

这一页的复杂度不在交互，在「把别人产出的 HTML 塞进一个只认子集的渲染器里」。三步正则、两套图片路径规则、一个靠 storage 传递的上下篇，都是同一件事的不同侧面：详情页拿不到结构化数据，只能对一段字符串做文本处理。上面 18 条里，第 1、2、3、4 条会直接让用户看到错误页面或错误文章，其余多数是「静默降级」——不报错，只是少了点什么。
