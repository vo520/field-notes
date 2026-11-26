---
title: 内容页：新闻详情、关于我们、常见问题、内嵌网页
description: 基于 uni-app 小程序四个内容页的真实代码，拆解官网新闻的富文本清洗、上/下篇、空态重试，以及关于我们、常见问题、webview 的 storage 传参和它带来的分享失效问题。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 富文本, 工程实践]
featured: false
draft: false
project: robot-forum-miniapp
---

这四个页面放在一起讲，是因为它们都是「只读内容」：官网新闻详情、关于我们、常见问题、内嵌网页。没有表单，没有提交，只有渲染和跳转。

但它们的实现质量差得很远。新闻详情有完整的三态（加载中、成功、空态重试）和一套富文本清洗；关于我们和常见问题直接 `v-for`，请求失败就是白屏；webview 只是一个 33 行的壳。更重要的是，后三个页面用 storage 传参，这直接导致分享出去的页面是空的。

## 1. 用户要完成什么

- 在首页「最新动态」点一条新闻，看标题、日期、阅读数、摘要、正文，预览正文图片；
- 点「查看官网原文」或「复制文章链接」，拿到官网地址；
- 通过「上一篇 / 下一篇」连续阅读；
- 从「我的」进「关于我们」，看平台协议、用户协议、社区公约等文档；
- 从「我的」进「常见问题」，看问题列表和答案；
- 点外链时，在内嵌 webview 里打开第三方页面。

## 2. 页面要怎么走

### 新闻详情：URL 带 id，缓存补上下文

首页的新闻卡片点击后：

```js
uni.navigateTo({ url: `/pages/news/detail?id=${item.id}` })
```

详情页 `onLoad` 做三件事：

```js
this.newsId = options.id ? parseInt(options.id) : null
try {
  this.cachedList = uni.getStorageSync(NEWS_LIST_KEY) || []
} catch (e) {
  this.cachedList = []
}
if (this.newsId) this.loadDetail()
else this.loading = false
```

`NEWS_LIST_KEY` 是 `offical_news_list_v1`，首页新闻 mixin 每次拉取官网接口后写入最新的 10 条。详情页自己不拉列表，只读这份缓存来算上/下篇。所以直接打开分享链接（没经过首页）时，`cachedList` 是空的，上/下篇不会显示。

加载成功后：

```js
this.detail = res.data
const title = res.data.title ? res.data.title.slice(0, 15) : '官网新闻'
uni.setNavigationBarTitle({ title })
```

导航标题取文章标题前 15 个字符，超出直接截断，不加省略号。`pages.json` 里的默认标题是「官网新闻」，接口失败时保持这个默认值。

### 上/下篇：靠数组下标

缓存列表是时间倒序（最新在 `[0]`），所以：

```js
currentIndex() {
  if (!this.cachedList.length || !this.newsId) return -1
  return this.cachedList.findIndex(item => item.id === this.newsId)
},
prevArticle() {
  if (this.currentIndex < 0 || this.currentIndex >= this.cachedList.length - 1) return null
  return this.cachedList[this.currentIndex + 1]
},
nextArticle() {
  if (this.currentIndex <= 0) return null
  return this.cachedList[this.currentIndex - 1]
}
```

「上一篇」是更旧的文章（`index + 1`），「下一篇」是更新的文章（`index - 1`），边界分别返回 `null`，模板用 `v-if` 控制显示。

点击时只做四件事：

```js
goPrev() {
  if (!this.prevArticle) return
  this.newsId = this.prevArticle.id
  this.detail = null
  this.loadDetail()
  uni.pageScrollTo({ scrollTop: 0, duration: 200 })
}
```

**没有更新页面栈里的 `id` 参数。** 也就是说，从 A 翻到 B 再分享，分享出去的是 A 的链接；返回上一页也不会回到 A。这是当前实现的真实行为。

### 关于我们：列表 + storage 详情

列表页 `GET /biz/config/key/au_`（key 末尾带下划线），返回值可能是 JSON 字符串，也可能是数组：

```js
if (typeof res.data === "string") {
  try { arr = JSON.parse(res.data) } catch (e) { arr = [] }
} else if (Array.isArray(res.data)) {
  arr = res.data
}
this.list = arr.map(item => ({ title: item.name, ...item }))
```

点击不传参，而是把整个对象序列化写进 storage：

```js
uni.setStorageSync("aboutUs", JSON.stringify(val))
uni.navigateTo({ url: "/pages/about-us-detail/index" })
```

详情页 `onLoad` 读出来，`JSON.parse` 后直接 `decodeURIComponent(obj.value)` 塞给 `rich-text`，并用 `name` 设置导航标题。`pages.json` 里这一页的 `navigationBarTitleText` 是空字符串，完全靠动态设置。

### 常见问题：列表 + storage 详情

列表 `POST /biz/faq/appletList`，取 `res.rows`。点击同样写 storage：

```js
uni.setStorageSync("question", JSON.stringify(val))
uni.navigateTo({ url: "/pages/question-detail/index" })
```

详情页只做 `JSON.parse`，然后分别用 `<text>` 渲染 `question` 和 `answer`。注意答案是纯文本，不是富文本——接口里如果有 HTML 标签，会原样显示出来。页面标题固定「问题答案」，不随问题变化。

### webview：storage 里取 URL

`openArticle` 遇到非公众号外链时：

```js
uni.setStorageSync("webviewUrl", obj.target)
uni.navigateTo({ url: `/pages/webview/index` })
```

webview 页面只有一个 `<web-view :src="src">`，`onLoad` 从 storage 取 `webviewUrl`。

## 3. 空和失败怎么处理

### 新闻详情：四个页面里唯一完整的

```html
<view v-if="loading" class="loading-wrap">
  <up-loading-icon text="加载中" size="40"></up-loading-icon>
</view>
<block v-else-if="detail"> … </block>
<view v-else class="empty">
  <text class="empty-icon">😔</text>
  <text class="empty-text">内容加载失败</text>
  <view class="empty-retry" @tap="loadDetail"><text>重试</text></view>
</view>
```

三种状态互斥：加载中居中显示 60vh 的 loading 图标；成功渲染正文；失败或无 id 显示 emoji、文案和重试按钮。

几个边界：

- `options.id` 缺失时 `newsId` 为 `null`，`loading` 直接置 `false`，进空态。此时点「重试」仍然调 `loadDetail()`，会用 `id=null` 请求一次，然后回到空态——重试对「无 id」这个场景没有意义。
- 接口返回 `code !== 200` 或 `data` 为空，也置 `detail = null` 进空态。
- 请求抛错只 `console.warn`，错误信息不展示给用户。
- 富文本为空时正文区高度为 0，摘要、底部操作、上/下篇仍正常显示。
- 封面/正文图片无图时 `bodyImages` 为空，「查看全部图片」入口不渲染。
- 分享时 `imageUrl` 取正文第一张图，没有则为空串。

### 关于我们 / 常见问题：没有空态，也没有 loading

两个列表页都是直接 `v-for`：

```html
<JCell v-for="(item,index) in list" :key="`cell${index}`" :item="item" :border="true" />
```

请求失败只留一行 `console.warn`，`list` 保持 `[]`，页面是一片纯白。没有「暂无内容」，没有重试，用户分不清是加载慢还是失败。首次进入时也没有 loading 占位，接口慢就会看到白屏闪一下。

`about-us-detail` 的 `decodeURIComponent` 没有 `try/catch`（`JSON.parse` 有）。如果配置里的 `value` 不是合法的 URI 编码，`onLoad` 会抛 `URIError`，`docObj` 保持 `{}`，页面显示空标题和空正文；如果 `value` 字段缺失，`decodeURIComponent(undefined)` 返回字符串 `"undefined"`，页面会直接把「undefined」渲染出来。

### 分享会丢数据

关于我们、常见问题、webview 三个页面都用同一段分享模板：

```js
const pages = getCurrentPages();
const page = pages[pages.length - 1];
const route = page && page.route ? page.route : "";
const options = page && page.options ? page.options : {};
```

它只转发路由和 query，而这三个页面的数据都在 storage 里，query 是空的。分享接收者打开时，自己机器的 storage 里没有 `aboutUs` / `question` / `webviewUrl`，于是：

- 关于我们详情：`docObj` 为 `{}`，白屏；
- 问题详情：`questionObj` 为 `{}`，白屏；
- webview：`src` 为空串，白屏。

新闻详情不受影响，因为它的 `path` 里带了 `id`。这是「用 storage 传参」最典型的代价：页面内跳转没问题，一旦离开这个页面栈就失效。正确做法是把文档 id 放进 URL，详情页按 id 请求接口，而不是序列化整个对象。

### 新闻上/下篇的两个边界

- 缓存为空（直接打开分享链接、清过缓存）→ `currentIndex` 为 -1 → 两个 `null` → 导航栏不渲染。
- 类型不一致：`findIndex(item => item.id === this.newsId)` 用的是严格相等，而 `this.newsId` 是 `parseInt` 后的数字。如果官网接口返回的 `id` 是字符串，`"123" === 123` 为 `false`，`currentIndex` 永远是 -1，上/下篇永远不显示。代码没有做类型归一化，属于潜在问题。

## 4. 界面为什么这样排版

### 新闻详情是「杂志式」阅读页

字号层级很明确：

| 元素 | 字号 | 颜色 | 说明 |
| --- | --- | --- | --- |
| 标题 | `40rpx / 700 / 1.5` | `#1a1a1a` | 与正文拉开层级 |
| 摘要 | `26rpx / 1.7` | `#4a5568` | 灰底、左侧 6rpx 蓝线 |
| 正文 | `30rpx / 1.85` | `#2d3748` | 行高接近 1.9，长文可读 |
| 元信息 | `24rpx` | `#9aa0ab` | 日期、阅读数 |
| 上/下篇标题 | `26rpx` | `#333` | 单行省略 |

摘要做成左边框引用卡：

```scss
.summary {
  margin-top: 28rpx;
  padding: 24rpx 28rpx;
  background: #f5f6fa;
  border-left: 6rpx solid #0047bb;
  border-radius: 4rpx;
}
```

它既不是正文，也不是标题，用浅灰底 + 品牌蓝竖线把它标成「导语」。正文用 `word-break: break-word`，防止长英文链接撑破屏幕。

「查看全部 N 张图片」是一个通栏浅灰按钮，图标和文字都居中，放在正文之后、底部操作之前。它只负责预览，不参与排版。

底部两个操作都是「复制」，但在视觉上是两行平级的文字链接，用 `1rpx` 上边框和正文隔开。文案不同（查看官网原文 / 复制文章链接），行为完全一样——都是 `setClipboardData` 加 toast。从交互上说，「查看官网原文」更应该真的打开 webview，现在只是复制，名不副实。

上/下篇用两块灰底卡片：

```scss
.nav-btn {
  display: flex;
  align-items: center;
  padding: 24rpx;
  margin-bottom: 16rpx;
  background: #f7f8fa;
  border-radius: 12rpx;
  &.next { justify-content: flex-end; }
}
```

上一篇箭头在左、文字在右；下一篇反过来右对齐。标题 `white-space: nowrap` 单行省略，`nav-info` 用 `flex: 1` 加 `overflow: hidden` 保证长标题不会把箭头挤走。箭头字号 `48rpx`、品牌蓝，是整块灰色里唯一的颜色。

### 空态的高度

```scss
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60vh;
}
```

用 `60vh` 而不是 `100vh`，是给导航栏留出视觉余量——内容在屏幕中间偏上，看起来比正中央更自然。emoji `80rpx`、文案 `28rpx` 灰、重试按钮品牌蓝胶囊 `40rpx` 圆角。

### 关于我们 / 常见问题是「文档目录」

两页都用 `JCell`，行高 `min-height: 90rpx`、左右 `44rpx` 内边距、右侧固定 24rpx 高的箭头。分隔线用伪元素：

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

`scaleY(0.5)` 让 1px 在 2 倍屏上变成 0.5px，比直接 1px 细。左右留 44rpx 和文字左边距对齐，不顶到屏幕边。

两个页面都传了 `:border="true"`，所以**最后一行下面也有一条线**。模板里本来有 `:border="index<list.length-1"` 被注释掉了，说明当时为了省事改成了全边框。这是可见的细节瑕疵：列表底部多一条悬空的分隔线。

导航都是白底黑字，和「我的」的蓝底白字不同。内容页需要长时间阅读，白底更接近文档；「我的」是功能入口，用品牌色做身份区。

### webview 是纯容器

页面只有一行：

```html
<web-view :src="src"></web-view>
```

`pages.json` 里标题为空、蓝底白字。标题留空是因为外链页面自己通常带标题，再叠一层会重复。蓝底是为了在外链加载出来之前，导航栏和品牌色一致，不出现白条闪烁。

## 5. 代码怎么落地

### 接口

| 页面 | 接口 | 方法 | 鉴权 |
| --- | --- | --- | --- |
| 新闻详情 | `https://www.dobot.cn/api.php?controller=MiniApi&act=detail&id=` | GET | 否 |
| 关于我们 | `/biz/config/key/au_` | GET | 否 |
| 常见问题 | `/biz/faq/appletList` | POST | 否 |
| 内嵌网页 | 无 | — | — |

新闻详情直接请求官网域名，不经过项目自己的 `baseUrl`。`request` 的 `get` 第二个参数是 query，第三个是 `auth`，这里传 `false`，所以不会带 token，也不会触发 401 静默重登。

### 富文本清洗的三段正则

`contentHtml` 是 `computed`，每次 `detail` 变化重算：

```js
// 1. 补全图片相对路径
html = html.replace(/(src=["'])(\/media\/[^"']+)(["'])/g, `$1${OFFICIAL_SITE}$2$3`)

// 2. img 去宽高和原 style，换自适应
html = html.replace(/<img\b([^>]*?)(\s*\/)?\s*>/gi, (match, attrs) => {
  let cleaned = attrs
    .replace(/\s+(width|height)\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+style\s*=\s*["'][^"']*["']/gi, '')
  return `<img${cleaned} style="display:block;max-width:100%;width:100%;height:auto;margin:16rpx 0;" />`
})

// 3. 去 <p> 上的 width 样式
html = html.replace(/<p([^>]*)style=["'][^"']*width[^"']*["']/gi, '<p$1')
```

第一步只处理以 `/media/` 开头的站内图片；第二步会删掉 `img` 上**所有** `style`，不只是宽高，如果原图有 `border-radius` 或 `float` 也会一起丢；第三步的正则会把整个 `style` 属性删掉，只因为里面包含 `width`，同一条 `p` 上的其他样式也会丢。

`rich-text` 支持内联 `style`，所以 `width: 100%` 能生效；但它不支持 `class` 和外部样式表，这就是为什么必须把样式写死在标签上。

### 图片列表的提取

```js
const re = /src=["']((?:https?:\/\/[^"']*?\/media\/[^"']*)|(?:\/media\/[^"']*))["']/gi
while ((m = re.exec(html)) !== null) {
  let url = m[1]
  if (!url.startsWith('http')) url = OFFICIAL_SITE + url
  if (!urls.includes(url)) urls.push(url)
}
```

只收集路径里含 `/media/` 的图片，并且去重。如果官网正文用了其他图床（CDN 域名、`/upload/` 路径），这些图不会进入预览列表，「查看全部 N 张图片」的数量会小于实际图片数。

### storage 传参协议

| key | 写入方 | 读取方 | 内容 |
| --- | --- | --- | --- |
| `offical_news_list_v1` | 首页新闻 mixin | 新闻详情 | 最新 10 条新闻 |
| `aboutUs` | 关于我们列表 | 关于我们详情 | 整条配置对象（JSON 字符串） |
| `question` | 常见问题列表 | 问题详情 | 整条 FAQ 对象（JSON 字符串） |
| `webviewUrl` | `openArticle` | webview 页 | 外链 URL |

前三个 key 都是「一次写入、立刻读取」，只在同一个页面栈里有效。`webviewUrl` 是全局单例，连续打开两个外链时，后一个会覆盖前一个；如果前一个 webview 页面还没销毁，返回时可能显示后一个链接。这是全局 storage 做参数通道的固有风险。

### 统一的分享模板

四个页面各复制了一份 `onShareAppMessage`，逻辑完全一致：取当前路由和 `options`，过滤空值，`encodeURIComponent` 后拼 query，`title` 留空。新闻详情额外带了 `imageUrl`。

这段代码本可以抽成 mixin 或工具函数，现在是五处（加上「我的」、活动页）重复。重复本身不是 bug，但改分享规则时要改六个文件，容易漏。

### 已知问题清单

1. 分享关于我们 / 问题 / webview 时，接收方打开是白屏——数据在 storage，不在 URL。
2. 新闻上/下篇用 `===` 比较 id，类型不一致就永远匹配不上。
3. 「查看官网原文」只复制链接，不打开页面。
4. 新闻重试在无 id 时无效。
5. `about-us-detail` 的 `decodeURIComponent` 没有异常保护。
6. 关于我们 / 常见问题没有 loading 和空态。
7. 两个列表的最后一行也带分隔线。
8. webview 页面不校验空 `src`，也不支持多实例。

---

四个内容页放在一起看，能看出一个清晰的分界：新闻详情是「按 id 请求」的模式，三态完整、可分享；另外三个是「storage 传对象」的模式，实现快、代码少，但分享即失效。前者是能上线的写法，后者只能算页面内跳转的临时方案。
