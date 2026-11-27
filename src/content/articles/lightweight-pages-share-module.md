---
title: 轻量页与分享层：四个靠 storage 传参的页面，和 18 份抄出来的转发代码
description: 基于 pages/questions、question-detail、about-us-detail、webview、login-setting 与全项目 23 处 onShareAppMessage 的真实源码，拆解用 storage 传对象带来的「分享即空页」、decodeURIComponent 无保护、web-view 无 URL 参数、退出登录只清 token，以及同一段转发代码被复制 18 次却没人用项目里已有的正确写法。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 页面设计, 分享]
chapter: components
order: 7
level: intro
featured: false
draft: false
project: robot-forum-miniapp
---

这一篇拆的是四张「点进去只为看一眼」的页面：常见问题答案、关于我们详情、外部网页、登录设置。它们加起来 282 行，加上列表侧和按钮组件，一共 409 行。

页面小，问题反而集中：**四张页面里有三张的内容不在 URL 里，而在 storage 里**。页面自己能用，一旦被转发出去，接收方打开的就是空页——而转发代码恰恰是每个页面都有的。

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `pages/questions/index.vue` | 66 | 常见问题列表，写入 storage |
| `pages/question-detail/index.vue` | 52 | 问题答案，从 storage 读 |
| `pages/about-us/index.vue` | 84 | 关于我们列表，写入 storage |
| `pages/about-us-detail/index.vue` | 52 | 富文本详情，从 storage 读 + decode |
| `pages/webview/index.vue` | 33 | 外部网页壳，从 storage 读 URL |
| `pages/login-setting/index.vue` | 79 | 退出登录，只有一个按钮 |
| `components/btn/index.vue` | 32 | 全宽主按钮 |
| `store/userInfo.js` | 11 | 只写不读的用户信息 store |

## 1. 用户要完成什么

1. **查一个问题的答案**：在「常见问题」里点某一行，进入「问题答案」，看到问题标题和整段回答。
2. **看公司介绍**：在「关于我们」里点某一项，进入详情，看到名称和一段富文本。
3. **打开外部链接**：点首页轮播、弹窗、图标区或活动页里的外链，进入 `web-view` 页面加载那个网址；如果链接是公众号文章，直接跳到微信文章页。
4. **退出登录**：在「我的 → 登录设置」点「退出登录」，弹窗确认，提示「已退出登录」，然后回到上一页。

四个动作都很短。用户对失败的全部感知是一屏白：点进去没有内容、打开网页一直转圈、退出后还停在原页面。

## 2. 页面要怎么走

### 2.1 常见问题：把整个对象塞进 storage

列表页点一行时，没有拼 URL 参数，而是把整个 cell 对象序列化后写进 storage：

```js
clickCell(val) {
  console.log("clickCell", val)
  uni.setStorageSync("question", JSON.stringify(val))
  uni.navigateTo({
    url: "/pages/question-detail/index"
  })
}
```

详情页在 `onLoad` 里读回来：

```js
onLoad() {
  let str = uni.getStorageSync("question")
  console.log("onload=========", str);
  if (str) {
    try {
      this.questionObj = JSON.parse(str)
    } catch (e) {
      console.warn("[question-detail] JSON.parse fail", e && e.message)
    }
  }
}
```

模板只读两个字段：

```html
<view class="mb5">
  <text class="ptl">{{questionObj.question}}</text>
</view>
<view class="mb10">
  <text class="pt">{{questionObj.answer}}</text>
</view>
```

`10` 和 `20` 是全局间距类，`.ptl` 是 32rpx 加粗标题，`.pt` 是 28rpx 正文。

这个方案在「列表 → 详情」这一条路上是成立的：`navigateTo` 每次新建页面，`onLoad` 一定执行，storage 也一定刚写过。它换来两个好处——不用把整段答案编码进 URL（小程序 URL 有长度限制，长回答很容易超），也不用再发一次请求。

代价藏在三个地方：

- **页面没有 URL 参数**。`navigateTo` 的目标是裸路径 `/pages/question-detail/index`，谁拿到这个路径都还原不出内容。
- **storage 是全局单键**。`question` 只存最后一次点击的那条，用户在两个问题之间来回点，靠的是「点一次写一次、进页面立刻读」的时序，而不是数据绑定。
- **`onLoad` 只读一次**。如果这个页面将来被复用（比如 `redirectTo` 或从分享进入再切走），不会重新读。

### 2.2 关于我们：同一个套路，少了 try/catch

列表页把接口数据整理成行对象再存：

```js
this.list = arr.map(item => ({
  title: item.name,
  ...item
}));
```

```js
clickCell(val) {
  console.log("clickCell", val)
  uni.setStorageSync("aboutUs", JSON.stringify(val))
  uni.navigateTo({
    url: "/pages/about-us-detail/index"
  })
}
```

详情页的 `onLoad` 比常见问题多了一步解码，但**没有任何异常保护**：

```js
onLoad() {
  let str = uni.getStorageSync("aboutUs")
  if (str) {
    let obj = JSON.parse(str);
    obj.value = decodeURIComponent(obj.value)
    this.docObj = obj;
    uni.setNavigationBarTitle({
      title: obj.name
    });
  }
}
```

对比上一节：`question-detail` 至少把 `JSON.parse` 包在了 `try/catch` 里，这里 `JSON.parse` 和 `decodeURIComponent` 都是裸调用。

`decodeURIComponent` 说明后端返回的 `value` 是 URI 编码过的 HTML（否则没必要解）。它会在两种情况下抛 `URIError`：

- `value` 里出现孤立的 `%`，比如正文写了「效率提升 100%」，而后端这次没有编码；
- `value` 缺失，`decodeURIComponent(undefined)` 不抛错，但会得到字符串 `"undefined"`，页面正文就显示一个 `undefined`。

`pages.json` 给这个页面配的标题是空字符串：

```json
{
  "path": "pages/about-us-detail/index",
  "style": {
    "navigationBarTitleText": "",
    "navigationBarBackgroundColor": "#ffffff",
    "navigationBarTextStyle": "black"
  }
}
```

标题完全依赖 `onLoad` 里的 `setNavigationBarTitle`。所以 storage 一空，页面就是「白底 + 空白导航栏 + 空内容」三白。

### 2.3 webview：全项目唯一的外部链接出口

外部链接进来的路径统一收在 `tools/util.js` 的 `openArticle()`：

```js
export const openArticle = (obj) => {
  if (obj.target) {
    if (obj.type == 0) {
      if (obj.target.indexOf("mp.weixin.qq.com") > -1) {
        openWeChatArticle(obj.target)
      } else {
        uni.setStorageSync("webviewUrl", obj.target)
        uni.navigateTo({
          url: `/pages/webview/index`
        })
      }
    } else if (obj.type == 1) {
      uni.navigateTo({
        url: `/pages/post/index?postId=${obj.target}`
      })
    } else if (obj.type == 2) {
      uni.navigateTo({
        url: `/pages/activity/index?eventId=${obj.target}`
      })
    }
  }
}
```

类型 1 和 2 都把 ID 拼进了 URL，只有类型 0（外链）走 storage。`openArticle` 的调用方有 5 处：首页轮播、首页弹窗、图标区、活动页、以及首页 mixin 里的兜底分支。

`webview` 页面本身只有 33 行：

```js
export default {
  onShareAppMessage() { /* 见 2.5 */ },
  data() {
    return { src: "" }
  },
  onLoad(obj) {
    this.src = uni.getStorageSync("webviewUrl")
  }
}
```

模板就一行 `<web-view :src="src"></web-view>`。

`onLoad(obj)` 收了参数却完全没用——正确的写法应该是 `?url=` 解码后赋值，storage 只作为兜底。现在这个页面：

- 没有 `loading` 状态，`web-view` 加载慢时是一片白；
- 没有 `@error` / `@message` 处理，域名未配置业务域名时用户只会看到微信的默认错误页；
- storage 里的 `webviewUrl` 从不删除，下一次进入（包括直接打开这个页面）会复用上一次的链接。

公众号文章那条分支走的是微信原生能力：

```js
export const openWeChatArticle = (url) => {
  uni.getSystemInfo({
    success(res) {
      console.log("getSystemInfo", res)
      if (res.host.env == "WeChat") {
        wx.openOfficialAccountArticle({
          url,
          success: res => {},
          fail: res => {}
        })
      } else {
        uni.showToast({
          title: `${res.hostName}`,
          icon: "error"
        })
      }
    }
  })
}
```

`success` / `fail` 都是空函数——非微信环境会给用户弹一个只有环境名的 toast（比如「App」），在微信里失败则完全没有反馈。另外 `openArticle` 判断公众号文章用的是 `indexOf("mp.weixin.qq.com") > -1`，这是子串匹配而不是域名解析，一个 `https://example.com/?mp.weixin.qq.com` 也会走进原生文章分支。

### 2.4 登录设置：一屏只有一个按钮

页面结构是三行：

```html
<view class="btn-box">
  <JMainBtn name="退出登录" @onClick="toLogout" />
</view>
<up-modal :show="showModal" title="提示" content='确定退出登录吗？' :showCancelButton="true"
  @confirm="confrimLogout" @cancel="cancelLogout" confirmColor="#0047bb"></up-modal>
```

`confrimLogout` 是拼错的（正确是 confirm），但模板和 methods 拼得一致，所以能跑：

```js
confrimLogout() {
  this.showModal = false;
  removeToken();
  try { clearVisitorStorage(); } catch (e) { /* 清理失败不阻塞登出 */ }
  uni.showToast({
    title: "已退出登录",
    icon: "none",
    success: () => {
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    }
  })
}
```

这里做了两件事、漏了一件：

- `removeToken()` 清登录态；
- `clearVisitorStorage()` 清访客模块的本地 PII（访客姓名、手机号、企业名、备注、待提交的时段选择、受访人缓存），函数内部对每个键都做了说明，是全项目注释最完整的一段；
- **没有清 `store/userInfo.js` 里的 `userInfo`**。

那个 store 只有 11 行，第一行注释还是复制来的：

```js
// store/counter.js
import { defineStore } from 'pinia'

export const useUserInfoStore = defineStore('userInfo', {
  state: () => ({ userInfo: {} }),
  getters: {},
  actions: {}
})
```

全项目有三处写它——首页 `mixins/userInfo.js`、论坛 `mixins/getData.js`、我的页 `getUserInfo()`——**没有任何一处读它**。所以退出登录不清它暂时没有可见后果，但它是一份会跨账号残留的内存数据。

两个时序问题也值得记：

- `uni.showToast` 的 `success` 是「调用成功」不是「展示结束」，这里靠 `setTimeout(1500)` 硬等，恰好等于 `showToast` 的默认时长；一旦有人改了 `duration`，提示会被提前切走。
- `uni.navigateBack()` 没有失败处理。从分享卡片或扫码直接进入这个页面时，页面栈只有一层，`navigateBack` 会失败，用户退出后仍然停在「退出登录」这一屏，可以再点一次。

入口在「我的」页面，且没有登录校验：

```js
} else if (item.title == "登录设置") {
  uni.navigateTo({
    url: `/pages/login-setting/index`
  })
}
```

对比同文件里「访客预约记录」是包在 `needLogin()` 里的。所以未登录用户也能进来点「退出登录」，看到「已退出登录」——只是本来就没有登录态可退。

### 2.5 分享层：23 个页面在转发，18 份代码一模一样

全项目有 23 个页面定义了 `onShareAppMessage`（定义即开启右上角「转发」）。按实现分成五类：

| 类型 | 页面数 | 写法 | 结果 |
| --- | --- | --- | --- |
| A 拼当前路由 + 空标题 | 18 | `getCurrentPages()` 取 `route`/`options` 重新拼 query，`title: ""` | 转发卡无标题；依赖 storage 的页面转发后是空页 |
| B 计数埋点 | 2（`post`、`forum`） | `this.store.changeShareNum(e.target.id)` + `shareChangePointApi`，**不 return** | 转发用默认标题/路径；右上角菜单转发时 `e.target` 为空 |
| C 真标题、无参数 | 1（`visit/record`） | `title: "我的访客预约记录"`，path 不带参数 | 接收方看到的是自己的本地记录 |
| D 参数化 + 菜单控制 | 1（`visit/detail`） | 标题带访客名和时间，path 带 `appointmentId`，`showShareMenu` 按条件开关 | 唯一完整的分享实现 |
| E 参数化 + 首图 | 1（`news/detail`） | `title: d.title`、`path` 带 `id`、`imageUrl: this.bodyImages[0]` | 正确 |

A 类那段代码逐字相同，18 份拷贝，连空行位置都一样：

```js
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

它想做的事是「把当前页原样转发」——用 `getCurrentPages()` 拿栈顶页面，读它的 `route` 和 `options`，手动拼回 query。这件事小程序框架本身就会做：`onShareAppMessage` 不返回 `path` 时，默认转发当前页面。这段代码等于手写了一遍默认行为，还搭进去两个缺陷：

1. **`title: ""`**。转发卡片没有标题，微信只能显示小程序名。项目里 `news/detail` 和 `visit/detail` 都证明了正确写法很简单：`title: 文章标题`。
2. **它假定内容在 URL 里**。A 类的 18 个页面中，`question-detail`、`about-us-detail`、`webview` 三张页面的内容全在 storage，路径里一个参数都没有。转发出去，接收方读到的 storage 是空的：问题页白屏、关于我们页白屏且导航栏无标题、网页页 `src` 为空。

B 类更彻底，两个页面都只做埋点，函数没有返回值：

```js
onShareAppMessage(e) {
  this.store.changeShareNum(e.target.id)
  shareChangePointApi(e.target.id * 1);
}
```

`e.target` 只在「页面内有 `<button open-type="share">` 触发」时存在；从右上角菜单转发时它是 `undefined`，这里直接取 `.id` 会抛错。另外分享计数是在「点击转发」时加的，用户取消发送也算一次。

C 类把「个人记录」当成了可分享内容：`visit/record` 的标题是「我的访客预约记录」，path 没有参数，接收方打开后看到的是**他自己**的本地预约记录。同一个文件的第 264 行留着一条注释，说明作者知道这一点——单条预约要从详情页分享。

D 类是全项目唯一做对的模板，注释也写清了原因：

```js
onShareAppMessage() {
  const aid = (this.item && (this.item.appointmentId || this.item.visitRecordId || this.item.id)) || this._aid;
  const name = (this.item && (this.item.visitorName || "游客")) || "访客预约";
  return {
    title: this.item
      ? `访客预约：${name} ${this.formatClock(this.timeRangeOf(this.item).start)}-${this.formatClock(this.timeRangeOf(this.item).end)}`
      : "访客预约",
    path: `/pages/visit/detail?appointmentId=${encodeURIComponent(String(aid || ""))}`
  };
}
```

配套还有 `_syncShareMenu()`：人脸没上传就 `hideShareMenu`，上传后再 `showShareMenu`，并在注释里说明「微信原生分享菜单(右上角胶囊)与 v-if 按钮无关，必须显式控制」。

也就是说：**正确模板在项目里已经存在两份，A 类的 18 份没有一份用它。**

## 3. 空和失败怎么处理

这一层的失败几乎全部表现为「白屏」，而且没有一处有兜底文案。

| 场景 | 代码路径 | 用户看到 |
| --- | --- | --- |
| 直接打开/转发打开问题答案 | storage `question` 为空，`questionObj` 保持 `{}` | 空白页，标题「问题答案」 |
| `question` 内容损坏 | `JSON.parse` 抛错 → `catch` 只 warn | 空白页 |
| 直接打开/转发打开关于我们详情 | storage `aboutUs` 为空 | 空白页 + 空白导航栏 |
| `aboutUs` 内容损坏 | `JSON.parse` 未捕获 → `onLoad` 中断 | 空白页 + 空白导航栏 |
| `value` 含孤立 `%` 或缺失 | `decodeURIComponent` 抛 `URIError` / 返回 `"undefined"` | 空白页 / 正文显示 `undefined` |
| 转发打开 webview | `src` 为空字符串 | 空白页面，无提示 |
| 外链域名未配置 | `web-view` 加载失败，未监听 `error` | 微信默认错误页 |
| 非微信环境打开公众号文章 | `showToast(title: hostName)` | 一个只有环境名的错误 toast |
| 常见问题接口失败 | `catch` 只 warn，`questionList` 保持 `[]` | 空白页，没有空态 |
| 未登录点退出登录 | 无校验 | 「已退出登录」 |
| 退出后页面栈只有一层 | `navigateBack()` 失败无回调 | 停留在退出页 |

`question-detail` 和 `about-us-detail` 是同一个模式的两次实现，差别只在保护程度：

```js
// question-detail
if (str) {
  try { this.questionObj = JSON.parse(str) } catch (e) { console.warn(...) }
}

// about-us-detail
if (str) {
  let obj = JSON.parse(str);          // 没有 catch
  obj.value = decodeURIComponent(obj.value)  // 没有 catch
  ...
}
```

两处 `catch` 也都只打日志——即使解析失败被接住，模板仍然渲染 `{{questionObj.question}}`、`{{docObj.name}}`，结果同样是一片白。这里缺的不是 `try/catch`，而是「没有内容时显示什么」。

## 4. 界面为什么要这样排版

**两个详情页用完全相同的骨架。** `padding: 32rpx 40rpx`，标题 `.mb5` 上留 5 个单位、正文 `.mb10` 上留 10 个单位，标题 32rpx 加粗、行高 48rpx，正文 28rpx 灰色、行高 44rpx。问题页和关于我们页的 `<style>` 里都只有这一条 padding 规则，其余全靠全局的 `.ptl` / `.pt` / `.mb5` / `.mb10`。好处是两个页面视觉一致，代价是改全局类会同时影响十几个页面。

**关于我们用 `rich-text` 而不是 `v-html`。** 小程序没有 `v-html`，富文本只能交给 `rich-text` 的 `nodes`。它接受 HTML 字符串，但只渲染受信任的标签子集、不执行脚本；`value` 先 `decodeURIComponent` 再传，说明后端存的是编码后的 HTML。

**退出按钮固定在 80% 高度。** 页面只有一颗按钮，放在文档流里会顶在顶部，看起来像「设置项列表的第一项」。用 `position: fixed; top: 80%; transform: translateY(-50%)` 把它压到屏幕下方、又在 home indicator 之上，左右各留 76rpx（比常规页面边距 44rpx 更宽），是因为 `JMainBtn` 本身是 100% 宽的大按钮，需要更多留白才不显得顶满。

`JMainBtn` 是 80rpx 高、40rpx 圆角的深蓝按钮，`hover-class="bmd"` 提供按下时加深 10% 的反馈——这是全项目少数用对了 `hover-class` 的地方（搜索框的 `:hover` 在小程序里根本不生效）。组件同时挂了 `fs18` 类和 `font-size: 36rpx` 的内联样式，后者覆盖前者，`fs18`（32rpx）是死类。

**webview 页的导航栏是蓝底白字、标题空。** 全屏网页没有自己的标题栏，蓝色顶栏是和首页保持连续的视觉过渡；标题留空是因为外部网页的标题在加载前未知，而页面也没有监听 `web-view` 的 `message` 去回写标题。结果就是一条纯蓝色空栏。

**分享卡片没有图。** 微信转发卡片默认取页面截图，A 类 18 个页面都没有 `imageUrl`；`news/detail` 用了正文第一张图，`visit/detail` 靠页面截图。

## 5. 代码怎么落地

### 5.1 关键调用链

```text
pages/questions/index.vue
└── clickCell(item)
      ├── uni.setStorageSync("question", JSON.stringify(item))
      └── navigateTo("/pages/question-detail/index")
            └── onLoad → getStorageSync("question") → JSON.parse → 渲染

pages/about-us/index.vue
└── clickCell(item)
      ├── uni.setStorageSync("aboutUs", JSON.stringify(item))
      └── navigateTo("/pages/about-us-detail/index")
            └── onLoad → JSON.parse → decodeURIComponent(value) → rich-text

tools/util.js openArticle({type, target})
├── type 0 + mp.weixin.qq.com → wx.openOfficialAccountArticle
├── type 0 + 其他             → setStorageSync("webviewUrl") + navigateTo(webview)
├── type 1                    → navigateTo(`/pages/post/index?postId=`)
└── type 2                    → navigateTo(`/pages/activity/index?eventId=`)

pages/mine/index.vue → clickCell("登录设置") → /pages/login-setting/index
└── 确认弹窗 → removeToken() + clearVisitorStorage() → toast → 1500ms → navigateBack()
```

### 5.2 如果要改，按这个顺序

1. **给三张 storage 页面补 URL 参数**：`question-detail?id=`、`about-us-detail?id=`、`webview?url=`，`onLoad` 优先读参数、读不到再退回 storage。只改 `onLoad` 和三个调用方，不动列表渲染。
2. **storage 兜底改成「缺内容就提示」**：`questionObj` 为空时渲染「内容不存在，返回列表」而不是两个空 `<text>`；`about-us-detail` 同理，并在无内容时把导航栏标题设成「关于我们」。
3. **`about-us-detail` 补保护**：`JSON.parse` 和 `decodeURIComponent` 各包一层 `try/catch`，解不出来就退化成纯文本渲染，别让 `onLoad` 中断。
4. **`webview` 用参数驱动**：`onLoad(obj)` 里读 `obj.url`，`decodeURIComponent` 后赋值；把「无 URL」渲染成错误态而不是空 `web-view`；加载中加 `loading`。
5. **分享代码收成一份**：把 A 类 18 份替换成 `tools/share.js` 里的一个函数（默认 path + 真实标题），或者直接删掉——不返回 `path` 就是微信的默认行为，删掉反而更对。至少要删掉 `title: ""`。
6. **B 类补返回值与空值判断**：`e.target && e.target.id`，并把计数移到 `success` 回调；返回真实的帖子标题和 `?postId=`。
7. **C 类改语义**：`visit/record` 不要对个人记录开放转发，直接 `uni.hideShareMenu()`。
8. **退出登录补两件事**：`navigateBack` 失败时 `reLaunch` 到首页或我的页；顺手清 `useUserInfoStore().userInfo = {}`。
9. **删掉只写不读的 store**：`store/userInfo.js` 目前三处写入零处读取，要么在需要的地方真正消费它，要么删掉，避免退出登录后残留跨账号数据。
10. **`openArticle` 的域名判断改成 `new URL(target).hostname === "mp.weixin.qq.com"`**，别用子串匹配；`openWeChatArticle` 的 `fail` 补一句 toast。
11. **清理调试输出**：`clickCell` 的 `console.log`、`question-detail onLoad` 的 `console.log`、`getSystemInfo` 的整包打印。

### 5.3 验证

- `npm test`：9 个测试文件、130 项全部通过。
- `npm run check`：80 个文件，0 error / 0 warning / 0 hint。
- `npm run build`：Pagefind 索引 79 页、20568 词。
- `npm run test:build`：构建冒烟 20 项全部通过。
- 产物：`dist/articles/lightweight-pages-share-module/index.html`、`dist/og/articles/lightweight-pages-share-module.png`。

这一层最值得记住的不是那 18 份拷贝，而是对比：同一个仓库里，`visit/detail` 和 `news/detail` 已经写出了带标题、带参数、带菜单控制的分享实现，注释还解释了为什么必须显式控制分享菜单。A 类的 18 个页面没有一个抄它，抄的是另一份更早、更省事、也更不能用的版本。复制本身不是问题，复制了错的那一份才是。
