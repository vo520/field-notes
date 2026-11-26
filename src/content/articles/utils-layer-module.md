---
title: 公共工具层：三种登录跳转、一个错误翻译器，和 384 行里的复制粘贴
description: 基于 tools/util.js 真实源码，拆解这个被 13 个文件依赖的公共工具层——三个几乎逐字相同的登录跳转为什么共用一把不会复位的锁、fixImgUrl 的子串判断会把相对路径误当绝对地址、simpleDate 对未来时间返回负数、convertToWanUnit 返回类型不稳定，以及 friendlyError 的三层分流。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 工具函数, 代码质量]
featured: false
draft: false
project: robot-forum-miniapp
---

前面十几篇拆的都是「一个页面」「一个业务模块」。这一篇拆一个没有界面、却被 13 个文件依赖的东西：`tools/util.js`，384 行，14 个导出函数。

它决定了四件用户能感知、但不会归因到它身上的事：没登录时看到哪句提示、图片加载失败时看到什么、帖子时间显示成「3 分钟前」还是「11-26」、接口报错时看到中文还是 `request:fail`。

## 1. 用户要完成什么

用户不会主动调用这个文件，但下面四个瞬间都由它决定：

| 用户遇到的情况 | 实际执行的函数 | 用户看到 |
| --- | --- | --- |
| 没登录就点「点赞」 | `needLogin` | 「此操作需要登录」，1.5 秒后跳登录页 |
| token 过期后刷新首页 | `silentLogin401` | 多数情况下无感；未注册则被引导到登录页 |
| 帖子封面图挂了 | `fixImgUrl` | 一张默认头像 |
| 接口 500 | `friendlyError` | 「服务器繁忙，请稍后重试」 |

这四个函数的调用量并不均衡。实测（按引用文件数）：

| 函数 | 引用文件数 | 定位 |
| --- | --- | --- |
| `fixImgUrl` | 13 | 全项目图片地址的唯一入口（理论上） |
| `needLogin` | 7 | 页面级登录闸门 |
| `openArticle` | 4 | 首页轮播、活动页、图标区的跳转分发 |
| `isVideoFileBySuffix` / `friendlyError` | 3 | 发帖选文件、错误提示 |
| `toLoginNeedToken` | 2 | 局部操作前的登录检查 |
| `toLogin401` / `innerListToOut` / `convertToWanUnit` / `simpleDate` / `getObjValue` | 1 | 只服务单一场景 |

`toLogin401` 只有 1 个外部调用方，但它同时也是 `silentLogin401` 的内部出口——真正的调用量藏在文件自己身上。

## 2. 页面要怎么走

### 2.1 三个登录入口，一把共享的锁

文件里有三段几乎逐字相同的代码，分别叫 `toLoginNeedToken`、`toLogin401`、`needLogin`：

```js
// tools/util.js:37-55
let doing = false;

export const toLoginNeedToken = () => {
  if (!doing) {
    doing = true;
    uni.showToast({
      title: "当前操作需要登录",
      icon: "none",
      success: () => {
        setTimeout(() => {
          uni.navigateTo({
            url: `/pages/login/index`,
            success: () => {
              doing = false;
            }
          })
        }, 1500)
      }
    })
  }
}
```

三段的差别只有两处：提示文案，以及 `needLogin` 会先检查 token、有 token 就直接执行回调。

```js
// tools/util.js:175-202（节选）
export const needLogin = (cb) => {
  const token = getToken();
  if (!token) {
    if (!doing) {
      doing = true;
      let pages = getCurrentPages();
      let currentRoute = pages[pages.length - 1].route;
      if (currentRoute != "pages/login/index") {
        uni.showToast({
          title: "此操作需要登录",
          // ...同样的 1.5 秒后 navigateTo
        })
      }
    }
  } else {
    cb ? cb() : false;
  }
}
```

`doing` 是模块级的，三个函数共享。设计意图是防重：用户连点五次「点赞」，只弹一次 toast、只跳一次页面。但它带来了两个真实后果，见第 3 节。

### 2.2 silentLogin401：Promise 单例 + 等待者队列

401 的处理是这份文件里唯一写得比较完整的部分，注释也最长——它记录了一次线上事故：

```js
// tools/util.js:86-116（节选）
export const silentLogin401 = (cb) => {
  // 修复"首页数据加载不全"：
  // 1) 原实现中 getSessionIdApi 返回非 200 时会 reject，.then() 后没有 .catch()，
  //    异常被吞掉，cb 永远不会被调用，调用方 request.js 永久挂起……
  if (_silentLoginPending) {
    _silentLoginWaiters.push(cb)
    return
  }
  // 首个调用方的 cb 也必须入队：否则静默重登结束后只有后续并发调用者被唤醒，
  // 首个 401 请求的回调永不触发 → request.js 里的 Promise 既不 resolve 也不 reject
  _silentLoginWaiters.push(cb)
  _silentLoginPending = _doSilentLogin()
  _silentLoginPending.finally(() => {
    _silentLoginPending = null
    const waiters = _silentLoginWaiters.splice(0)
    waiters.forEach(w => {
      try {
        typeof w === 'function' && w(_lastSilentLoginResult)
      } catch (e) {
        console.error('silentLogin401|waiter|error', e)
      }
    })
  })
}
```

首页 `onLoad` 会同时发出多个带鉴权的请求，401 也会同时到达。这里用「单例 Promise + 队列 + settled 值」保证：只调一次 `wx.login`，所有等待者都拿到同一个布尔结果，不会有 Promise 悬空。

### 2.3 fixImgUrl：一条正则决定补不补域名

```js
// tools/util.js:17-33
export const fixImgUrl = (val) => {
  if (val) {
    if (val && /\\image/.test(val)) {
      val = val.replace(/\\image/, "/image")
    }
    if (!/http/.test(val) && !/https/.test(val)) {
      val = baseUrl + prefix + val
    }
  } else {
    val = EmptyHeadImg
  }
  return val;
}
```

它做三件事：把 Windows 风格的反斜杠路径改成斜杠；判断是不是绝对地址，不是就拼 `baseUrl + prefix`；空值返回默认头像。

第 25 行的判断 `!/http/.test(val) && !/https/.test(val)` 实际上是多余的——`/http/` 已经匹配 `https` 了。

### 2.4 simpleDate：五段式相对时间

```js
// tools/util.js:313-332（节选）
if (diff < oneMinute) {
  return Math.floor(diff / 1000) + " 秒前";
} else if (diff < oneHour) {
  return Math.floor(diff / oneMinute) + " 分钟前";
} else if (diff < oneDay) {
  return Math.floor(diff / oneHour) + " 小时前";
} else if (diff < 2 * oneDay) {
  let yesterday = new Date(now.getTime() - oneDay);
  return "昨天 " + (inputDate.getMonth() + 1) + "-" + inputDate.getDate();
} else if (diff < oneYear) {
  return (inputDate.getMonth() + 1) + "-" + inputDate.getDate();
} else {
  return inputDate.getFullYear() + "-" + (inputDate.getMonth() + 1) + "-" + inputDate.getDate();
}
```

五档全按毫秒差分段，不按自然日切。所以「昨天」这一档实际含义是「24 到 48 小时前」，而不是日历上的昨天。

### 2.5 friendlyError：三层分流

这是文件里唯一有完整入参说明的函数，注释占了 8 行，把四类错误输入都列了：

```js
// tools/util.js:343-366（节选）
export function friendlyError(err, fallback = "操作失败，请稍后重试") {
  if (!err) return fallback
  if (typeof err === "string") return err

  // 1. 后端业务响应：{code, msg/message}
  if (err.code !== undefined && err.code !== null) {
    const msg = err.msg || err.message || ""
    switch (err.code) {
      case 401: return "登录已过期，请重新登录"
      case 403: return "没有操作权限"
      case 404: return "请求的资源不存在"
      case 500: return "服务器繁忙，请稍后重试"
      default:
        // 业务错误码：后端 msg 可能是有用的（如"手机号已存在"），但过滤技术性描述
        if (msg && !/认证失败|无法访问系统资源|请求访问/.test(msg)) {
          return msg
        }
        return fallback
    }
  }
```

分流顺序是：字符串原样返回 → 有 `code` 走业务映射 → `errMsg` 里匹配 `fail/timeout/abort` → `Error` 对象按关键词兜底。

这个顺序有一个副作用：只要对象上带 `code`（哪怕是 `0`），就再也不会走到网络异常分支。

### 2.6 两个只服务单一场景的函数

`innerListToOut` 把树形评论（一级 + 二级 + 三级）摊平成数组，同时给每层打 `isOut` 标记：

```js
// tools/util.js:220-238（节选）
export const innerListToOut = (list, key, out) => {
  let res = [];
  list.map(item => {
    item.isOut = out === false ? false : true;
    res.push(item)
    if (item[key]) {
      item[key].map(inner => {
        res.push(inner)
```

`convertToWanUnit` 把数字转成「万」：

```js
// tools/util.js:240-245
export function convertToWanUnit(num) {
  if (isFinite(+num) && num * 1 >= 10000) {
    return (num / 10000).toFixed(1) + "万";
  }
  return num;
}
```

两个函数各只有一个调用方，属于「先抽出公共函数，但暂时只用到一次」的类型。

## 3. 空和失败怎么处理

| 情况 | 代码行为 | 用户看到 |
| --- | --- | --- |
| 无 token，点需要登录的操作 | toast + 1.5 秒后 `navigateTo` 登录页 | 「此操作需要登录」 |
| 无 token，且已在登录页 | `doing` 置 true 后直接结束，不复位 | 什么都不发生，且后续不再提示 |
| 跳转失败（页面栈满） | `doing` 不复位 | 后续所有登录提示失效 |
| 静默登录返回 `token: null` | 不弹「登录失败」，走登录页引导 | 被带到登录页 |
| 静默登录接口异常 | toast「登录失败」，resolve `false` | 红色错误提示 |
| 图片地址为空 | 返回内置头像 | 文章封面变成人脸头像 |
| 时间为未来 | `diff` 为负，落入第一档 | 「−3 秒前」 |
| 视频后缀大写 | 不在白名单内 | 被当成图片处理 |

### 3.1 锁为什么不会复位

`doing` 的三段代码里，复位只写在 `navigateTo` 的 `success` 回调里：

```js
uni.navigateTo({
  url: `/pages/login/index`,
  success: () => {
    doing = false;
  }
})
```

于是有三种情况会让它永久保持 `true`：

1. 当前已经在登录页——`if (currentRoute != "pages/login/index")` 不成立，整个 toast 和跳转都被跳过，`doing` 停在 `true`；
2. 页面栈已满，`navigateTo` 失败，`success` 不执行；
3. `navigateTo` 因其他原因失败（目标页编译中、路由错误）。

第 1 种最容易复现：用户在登录页手动触发一个需要登录的按钮，之后整个小程序会话里，所有 `needLogin` 都不再有任何反应。

### 3.2 「静默登录」处理得比显式登录更仔细

对比之下，`_doSilentLogin` 的注释是这份文件里质量最高的：

```js
// tools/util.js:131-136
// token:null 不是错误：该微信用户在后端尚未注册/绑定，
// 后端正常返回 code:200 + token:null（见真机日志）。
// 原实现弹「登录失败」error toast 并反复静默重登，
// 用户被反复打扰、登录体验混乱。
// 正确做法：引导去登录页完成手机号授权，注册成功后才会下发 token。
console.warn("silentLogin401|未注册/未绑定，引导登录", res2)
```

它明确区分了「接口失败」和「用户未注册」两种 `token` 缺失，前者报错、后者引导，且引导失败也不会让 Promise 悬空。

## 4. 界面为什么要这样排版

工具层没有排版，但它决定了页面上的四个文案细节。

### 4.1 三句登录提示，三个说法

| 函数 | 文案 |
| --- | --- |
| `toLoginNeedToken` | 当前操作需要登录 |
| `needLogin` | 此操作需要登录 |
| `toLogin401` | 登录已过期，需重新登陆 |

同一件事在一份 384 行的文件里出现了三种措辞，最后一句还有错别字（「登陆」应为「登录」）。这是复制粘贴留下的痕迹。

### 4.2 1.5 秒是为了让 toast 被读到

三个函数都在 toast 的 `success` 回调里等 1.5 秒再跳转，而不是立刻 `navigateTo`。原因是 `uni.showToast` 默认 1.5 秒，如果立刻跳页，toast 会被新页面覆盖，用户只会看到「突然跳到了登录页」，不知道原因。

代价是：这 1.5 秒里用户如果重复点击，`doing` 正好挡住了重复弹窗——锁的设计和延迟是配套的。

### 4.3 图片兜底是「头像」，不是「占位图」

`fixImgUrl` 的空值分支返回 `EmptyHeadImg`，一张人物头像。这在头像场景是对的，但同一个函数被 13 个文件共用，包括文章封面、活动海报、轮播图。这些位置图片为空时，用户会看到一张不合适的人脸。

```js
// tools/util.js:29-31
} else {
  val = EmptyHeadImg
}
```

### 4.4 时间显示只保留到「月-日」

24 小时内显示相对时间，48 小时内显示「昨天」，一年内显示「11-26」，跨年才带年份。这个梯度在小屏上是合理的：帖子流里最需要判断的是「新不新」，而不是「哪一天」。

## 5. 代码怎么落地

### 5.1 调用关系

```
页面 / 组件
  ├─ fixImgUrl        ← 13 个文件（卡片、详情、头像、轮播）
  ├─ needLogin        ← 7 个文件（点赞、收藏、报名、访客记录）
  ├─ openArticle      ← 4 个文件（首页轮播、图标区、活动页）
  ├─ friendlyError    ← 3 个文件（提交失败提示）
  └─ toLoginNeedToken ← 2 个文件
        │
        └─ silentLogin401 ← request.js 的 401 分支（内部单例）
              └─ toLogin401 ← 未注册时的引导出口
```

### 5.2 五条实现要点

1. **登录闸门要收敛成一个函数**。三份拷贝已经漂移出三种文案，第四份出现时就会漂移出第四个行为。
2. **锁要有兜底释放**。`success` 之外还应有 `fail` 与 `complete`，或者用时间戳过期（其他页面里已有 `setTimeout` 3 秒自动复位的先例）。
3. **静默重登必须是单例**。首页并发 401 会同时触发多次 `wx.login`，这里用 Promise + 队列解决了，值得保留。
4. **`token: null` 不是错误**。区分「接口挂了」和「用户没注册」，是这段代码里最有价值的一条经验。
5. **公开函数的返回类型要稳定**。`convertToWanUnit` 一半返回数字一半返回字符串，调用方只能靠隐式转换。

### 5.3 记录的真实问题

| # | 问题 | 位置 |
| --- | --- | --- |
| 1 | `doing` 由三个函数共享；在登录页触发时置 `true` 后永不复位，此后整个会话的登录提示全部失效 | `util.js:37-79`、`175-198` |
| 2 | 三个登录函数各自复制约 20 行相同逻辑，文案已漂移出三种，其中一个含错别字「登陆」 | `util.js:41`、`184`、`64` |
| 3 | `doing` 只在 `navigateTo` 的 `success` 里复位，跳转失败即永久锁死 | `util.js:47-49` |
| 4 | `fixImgUrl` 用 `/http/` 子串判断绝对地址，`/image/http_2024/a.png` 这类相对路径会被误判 | `util.js:24` |
| 5 | `fixImgUrl` 对任何空值返回默认头像，文章封面、活动海报同样适用 | `util.js:29-31` |
| 6 | `simpleDate` 对未来时间返回负数（「−3 秒前」），服务端时钟稍快即触发 | `util.js:303-315` |
| 7 | `simpleDate` 的「昨天」按 48 小时判断，不是自然日：前天 23:00 在今天 00:30 会显示「昨天」 | `util.js:322-325` |
| 8 | `isVideoFileBySuffix` 不转小写，`.MP4` 不被识别；且直接读 `file.name`，传 `null` 抛 TypeError | `util.js:204-207` |
| 9 | `convertToWanUnit` 返回类型不稳定：小于一万返回 number，大于等于一万返回 string；过亿仍显示「10000.0万」 | `util.js:240-245` |
| 10 | `innerListToOut` 直接改写入参对象的 `isOut`，调用方原始数据被污染 | `util.js:223` |
| 11 | `html2canvas` 被 import 但文件内零使用，是死导入 | `util.js:9` |
| 12 | `friendlyError` 只要对象带 `code` 就不再看 `errMsg`；`{code: 0, msg: "ok"}` 会把 `ok` 当错误提示返回 | `util.js:348-366` |

### 5.4 验证

- `npm test`：134 项通过。
- `npm run check`：84 个文件，0 error / 0 warning / 0 hint。
- `npm run build`：Pagefind 索引 85 页、22082 词。
- `npm run test:build`：构建冒烟 22 项全部通过。
- 产物：`dist/articles/utils-layer-module/index.html`、`dist/og/articles/utils-layer-module.png`。

这个文件没有一行模板代码，却决定了用户在四个关键时刻看到什么。它的问题也不是「写错了」，而是「复制之后没有回头合并」——三个登录函数、四种错误文案、两个只调用一次的工具函数，都是同一种习惯的产物。
