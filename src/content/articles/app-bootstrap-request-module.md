---
title: 应用启动与请求底座：socket 补丁、版本强更和一层拦截器
description: 基于 App.vue、main.js、tools/request.js 与 uview-plus luch-request 的真实源码，拆解小程序冷启动的执行顺序、wx.closeSocket 补丁为何写了两份、401 静默重登的重放链路，以及 auth=false 仍带 token、HTTP 401 不重登这些真实行为。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 基础设施, 请求封装]
featured: false
draft: false
project: robot-forum-miniapp
---

前面十篇都在拆页面，这一篇拆页面底下那层东西：小程序冷启动时谁先执行、全局 `wx` 被改了什么、以及每个页面调用的 `get` / `post` 到底经过了几道拦截。

这层代码一共三个文件：[main.js](file:///Users/mq/Documents/gitee/DobotMiniAPP/main.js) 60 行、[App.vue](file:///Users/mq/Documents/gitee/DobotMiniAPP/App.vue) 102 行、[request.js](file:///Users/mq/Documents/gitee/DobotMiniAPP/tools/request.js) 240 行。业务代码里所有接口都在 `api/index.js` 里用这五个函数包一层：`get`、`post`、`put`、`del`、`upload`。

## 1. 用户要完成什么

用户感知不到「请求底座」，他只感知到这四件事：

- 冷启动打开小程序，首页数据能出来；
- 登录过期后，不需要手动重新登录，页面自己恢复；
- 断网、超时、后端报错时，能看到一句人话，而不是一直转圈；
- 发了新版本，打开就被要求更新，不能带着旧版本继续用。

这四件事分别由启动层（socket 补丁 + 版本强更）和请求层（拦截器 + 401 重放）承担。

## 2. 页面要怎么走

### 冷启动的真实顺序

微信小程序启动时，App service 先执行 `main.js` 的模块体，再创建 Vue 实例。按编译后的执行顺序：

```js
// main.js
import App from './App'          // 1. 先执行 App.vue 的模块体（只注册组件选项，不跑 created）
import pinia from './store'
import uviewPlus from '@/uni_modules/uview-plus'
import { initRequest } from './tools/request.js'

try { /* 2. patch wx.closeSocket */ } catch (e) { ... }

// 3. Vue2 分支
const app = new Vue({ ...App })  // 4. 这里才同步触发 App.vue 的 created
initRequest(app)                 // 5. 注册请求/响应拦截器
app.$mount()                     // 6. 挂载，随后 onLaunch 触发
```

所以 `App.vue` 的 `created` 不是「最早执行点」，它排在 `main.js` 顶层代码之后。真正的顺序是：**main.js 顶层 → App.vue created → initRequest → $mount → onLaunch → 首页 onLoad**。

VUE3 分支是另一条路：

```js
export function createApp() {
  const app = createSSRApp(App)
  initRequest(app)
  app.use(pinia)
  app.use(uviewPlus)
  return { app }
}
```

两条分支都在 `app` 创建后立刻 `initRequest(app)`，区别只是 VUE2 在 `new Vue` 之后、`$mount` 之前，VUE3 在 `createSSRApp` 之后。

### socket 补丁：同一个函数写了两份

微信基础库要求 `close` 的 code 必须是 `1000` 或 `3000–4999`，而 uni-app 的 dev socket 会以 `1006` 关闭，控制台因此报警。业务代码改不了编译产物，只能拦截全局 API：

```js
const _closeSocket = typeof wx !== 'undefined' && wx.closeSocket
if (_closeSocket && !_closeSocket.__yjPatched) {
  const patched = function (opt) {
    const o = opt || {}
    const code = o.code
    const ok = code === 1000 || (typeof code === 'number' && code >= 3000 && code <= 4999)
    const fixed = ok ? o : Object.assign({}, o, { code: 1000 })
    return _closeSocket.call(this, fixed)
  }
  patched.__yjPatched = true
  wx.closeSocket = patched
}
```

`main.js` 和 `App.vue` 里各有一份完全相同的逻辑，都用 `__yjPatched` 标记防止重复包装。`connectSocket` 那份更绕一层：不替换 `close` 本身，而是替换 `connectSocket`，在它返回的 `socketTask` 上再包一层 `close`。

代码与注释在这里是冲突的。`App.vue` 的注释说 `created` 是最早执行点、`main.js` 的补丁只是「防御」；但按编译顺序，`main.js` 顶层先跑，装完补丁后把 `__yjPatched` 置为 `true`，等到 `App.vue` 的 `created` 执行时守卫条件直接不成立，那一份必然被跳过。**实际生效的是 `main.js` 那份**，`App.vue` 那份在当前编译产物下永远不执行。

### 请求链路：包了四层

一次业务请求要穿过这些层：

```text
页面方法
  → api/index.js 里的 xxxApi()        // 只做参数拼装
  → tools/request.js 的 get/post       // custom.auth / catch / toast
  → uview-plus luch-request 请求拦截器  // 写 Authorization、按需 loading
  → uni.request（adapter + settle）    // 网络层，按 statusCode 决定 resolve/reject
  → uview-plus 响应拦截器              // 判 body.code，toast 或 reject
  → tools/request.js 的 401 重放       // silentLogin401
  → 页面 .then / .catch
```

uview-plus 的默认配置里 `header: {}`、`custom: {}`、`timeout: 60000`，所以 `config.custom.auth` 和 `config.header.Authorization = token` 都不会因为字段不存在而报错。超时是 60 秒，项目没有在 `pages.json` 里配置 `networkTimeout`。

### 请求拦截器：三个动作

```js
http.interceptors.request.use((config) => {
  config.data = config.data || {}
  let token = getToken();
  if (config.custom.auth || token) {
    if (!token) {
      return Promise.reject({ code: 401, msg: "未登录或登录已过期" })
    }
    config.header.Authorization = token;
  }
  if (config.custom.loading) {
    uni.showLoading()
  }
  return config
}, (config) => Promise.reject(config))
```

1. `data` 兜底成 `{}`；
2. 判定条件写的是 `config.custom.auth || token`，不是 `&&`。也就是说 `auth=false` 的公开接口，只要 storage 里有 token，照样会带上 `Authorization`；
3. `auth=true` 且没有 token 时，直接 `reject`，请求根本不会发出去。

`Authorization` 的值是裸 token，没有 `Bearer ` 前缀，这是和后端的约定。

### 响应拦截器：按 body.code 分流

```js
if (data.code == 401) {
  return data || {}
}
if (data.code !== 200) {
  if (custom.toast !== false) {
    toast(data.message || data.msg || "请求失败")
  }
  if (custom?.catch) {
    return Promise.reject(data)
  }
  return Promise.reject(data)
}
return data || {}
```

`401` 不在这里处理，而是原样 `resolve` 回去，交给包装层决定是否静默重登；其余非 200 先 toast 再 reject。注释里记录了一段历史：原来这里写的是 `return new Promise(() => {})`，Promise 永久挂起，任何 `.catch` 都接不到，`await` 永远不返回，页面 loading 锁死，表现为白屏。

### 包装层：401 重放一次

五个函数结构完全一样，以 `get` 为例：

```js
export const get = (api, params, auth, toast = true) => {
  return new Promise((resolve, reject) => {
    http.get(api, {
      params: params || {},
      custom: { auth: auth === false ? false : true, catch: true, toast },
    }).then(res => {
      if (res.code == 401) {
        if (getToken()) {
          silentLogin401(flag => {
            if (flag) {
              get(api, params, auth).then(resolve).catch(reject)
            } else {
              reject(res)
            }
          });
        } else {
          reject(res)
        }
      } else {
        resolve(res)
      }
    }).catch(err => reject(err))
  })
}
```

`auth === false ? false : true` 这行的意思是：不传 `auth` 就是强制登录。`api/index.js` 里列表类接口普遍显式传 `false`，详情、发布、点赞传 `true` 或不传。

`silentLogin401` 在 [util.js](file:///Users/mq/Documents/gitee/DobotMiniAPP/tools/util.js#L81-L116) 里是 Promise 单例：`wx.login` 最多等 60 秒，拿到新 code 换 `getSessionIdApi`，成功则写 token，失败则弹「登录失败」并 `resolve(false)`，所有并发等待者共享同一个结果。注释说明这个单例是为了修「首页数据加载不全」——首页 `onLoad` 同时发多个 `auth=true` 请求，原来会并发触发多次 `wx.login`，部分回调互相覆盖。

## 3. 空和失败怎么处理

**401 有三种完全不同的路径，只有一种会触发静默重登。**

| 场景 | 走到哪 | 结果 |
| --- | --- | --- |
| `auth=true` 且本地无 token | 请求拦截器 | 请求不发，`reject({code:401,msg})` |
| HTTP 状态码 401 | `settle` reject → 响应拦截器拒绝分支 | 原始 response 直接抛给调用方，**不重登** |
| HTTP 200 + body `code:401`，有 token | 包装层 | `silentLogin401` 重登，成功后重放一次 |
| HTTP 200 + body `code:401`，无 token | 包装层 | 直接 `reject(res)` |

第二行是最容易被忽略的：`settle` 只看 `statusCode`，非 2xx 会直接 `reject(response)`，响应拦截器的成功分支根本不执行，`data.code == 401` 那段代码也就没机会跑。所以后台如果改成返回真正的 HTTP 401，静默重登会整体失效。

**重登失败后不是静默的。** `silentLogin401` 返回 `false` 时，包装层把原始 401 对象 reject 给页面；同时 `util.js` 里已经调过 `toLogin401()`，弹「登录已过期，需重新登陆」并在 1.5 秒后跳登录页。未注册用户（后端返回 `code:200 + token:null`）走的也是这条路，只是不弹错误 toast。

**重放没有次数上限。** 重放用的是 `get(api, params, auth)`，如果再拿到 401，会重新进入 `silentLogin401`。只要「重登成功但接口仍返回 401」这个组合出现，就是一个登录↔重放的循环，没有计数器兜底。

**重放会丢掉 toast 参数。** 原调用是 `get(api, params, auth, false)` 时，重放写的是 `get(api, params, auth)`，第五个参数回落成默认 `true`。`post`、`put`、`del` 同样。

**非 200 的 body 一定会 reject。** 包装层把 `custom.catch` 写死为 `true`，所以响应拦截器里 `if (custom?.catch)` 这个分支对五个公开函数永远成立，另一个 `Promise.reject(data)` 是重复的兜底。

**网络层失败完全没有提示。** 响应拦截器的拒绝分支只有 `return Promise.reject(response)`，不 toast。超时、断网、DNS 失败都只把原始 response 交给调用方，页面不 catch 就什么都不会发生。`friendlyError` 能识别 `errMsg` 里的 `fail / timeout / abort`，但需要调用方主动调用它。

**上传的错误是全静默的。** `upload` 固定 `auth: true`、`toast: false`、`name: 'file'`。业务错误既不弹 toast，也不在 `filePath` 为空时报错，只是把 `filePath || ''` 交给 `uni.uploadFile`。

**空响应会被当成失败。** 响应拦截器读的是 `response.data`，后端如果返回 204 或空 body，`data` 是空字符串，`data.code` 为 `undefined`，`undefined !== 200` 成立 → 弹「请求失败」并 reject。

**版本更新失败只弹一次框。** `onUpdateFailed` 弹「新版本下载失败，请检查网络后重启小程序重试」，`showCancel: false`，没有重试按钮，也没有再次调用 `onCheckForUpdate`。`applyUpdate()` 抛错只 `console.warn`，用户会停在「立即更新」点不动的状态。

**socket 补丁失败只打日志。** 两层包装都在 `try/catch` 里，出错只 `console.error('patch wx.closeSocket|error', e)`，不影响启动。

## 4. 界面为什么要这样排版

这一层没有页面，但它决定了用户看到哪一种提示。项目里只有三级反馈，优先级从低到高：

**loading 是页面自己的，不是请求层的。** 包装函数从不设置 `custom.loading`，五个函数的 `custom` 对象里只有 `auth`、`catch`、`toast` 三个字段。请求拦截器里那段 `if (config.custom.loading) uni.showLoading()` 因此走不到；而且整个 `request.js` 里没有任何 `uni.hideLoading()`，即使有人打开这个开关，遮罩也不会自己消失。加载态一律由页面在 `try/finally` 里自己管，比如列表页的 `loading` 锁加 `uni.showLoading({ title: "" })`。

**toast 是默认行为，上传是例外。** 普通接口的非 200 直接在拦截器里 toast，页面不需要重复提示；上传不 toast，因为发布弹层有自己的按钮状态和错误展示位置，再叠一个系统 toast 会挡住按钮。

**modal 只留给「必须中断」的场景。** 整个基础设施层只有两处 `showModal`，都在版本更新里：`onUpdateReady` 和 `onUpdateFailed`。两处都是 `showCancel: false`，因为它们的前提是「旧版本不能继续用」，给取消按钮等于给用户留一条坏路径。

**401 不第一时间跳登录，是有意的。** 首页有大量 `auth=false` 的公开接口，冷启动时如果 token 过期，先静默重登一次；只有重登真的失败，才弹 toast 并在 1.5 秒后跳登录页。这个 1.5 秒的延迟是为了让 toast 读完，跳转由 `toLogin401` 里的 `doing` 锁防重复，并且当前已经在登录页时不再跳。

## 5. 代码怎么落地

**1）启动层只做两件事。** `App.vue` 的 `created` 打 socket 补丁，`onLaunch` 调 `_checkMiniUpdate()`。`onShow` / `onHide` 是空实现，只剩注释。样式入口也在这里：`uview-plus/index.scss` 加上三个 `static/style` 文件。

**2）请求层只做三件事。** `initRequest` 设 `baseURL`（`https://miniapp.dobot.cn` + `/dobot`）、注册请求拦截器、注册响应拦截器。`vm` 参数从头到尾没被用过，传 `app` 只是为了将来可能挂全局属性。

**3）业务层只有五个出口。** `api/index.js` 顶部 `import { post, get, put, del, upload } from "@/tools/request"`，之后所有接口都是这五个函数的薄封装。绕过封装的只有三处 `uni.request`：`tools/searchCompanyName.js`、`tools/moredian.js`、以及 `api/index.js` 里直连 Node 的 `fetchNodeVisitInfo`（为了用 `dataType: "text"` 保住 19 位 Long 的精度）。这三处不经过拦截器，也就没有 `Authorization` 和 401 重放。

**4）几处确定的缺陷清单**（都能在源码里直接定位）：

- `main.js` 与 `App.vue` 的 socket 补丁重复，且注释描述的执行顺序与代码相反；当前实际生效的是 `main.js`，`App.vue` 那份被 `__yjPatched` 跳过。
- `connectSocket` 返回的 `task.close` 替换没有包 `try/catch`（外层只包了安装过程），若框架返回不可写对象，异常会抛进框架的 socket 创建流程。
- 响应拦截器只处理 body 里的 `code:401`；真 HTTP 401 被 `settle` 直接 reject，静默重登不触发。
- `data.code == 401` 用宽松相等、`data.code !== 200` 用严格不等，后端若返回字符串 `"200"`，会被判成失败并 toast。
- 重放不带 `toast` 参数，原本静默的请求在重放后会弹提示。
- 重放没有次数上限，后端持续 401 时会形成登录↔重放循环。
- 网络层失败不 toast，完全依赖调用方自己 catch。
- `upload` 的 `name: 'file'` 写死，`toast: false` 写死，后端字段或提示策略变更都要改源码。
- `custom.loading` 分支不可达，且没有配对的 `hideLoading`。
- `initRequest(app)` 的 `vm` 未被使用；VUE2 下拦截器在 `new Vue` 之后才注册。
- `silentLogin401` 里 `wx.login` 超时设为 60 秒，这段时间调用方的 Promise 一直 pending，页面 loading 会跟着转。
- `toLogin401` 的 `doing` 只在 `navigateTo` 成功回调里复位，跳转失败会永久卡住，后续 401 再也不跳登录页。
- `console.log("upload", api, filePath)` 残留，每次上传都打印。

这层代码的价值不在优雅，而在把所有失败都收敛成三种可预期的结果：要么 resolve 一个 `{code:200,...}`，要么 reject 一个带 `code/msg` 的对象，要么 reject 一个网络层原始响应。页面只要按这三种情况写 `catch`，就不会出现转圈不停或白屏。反过来说，这层里任何一个分支写错（比如那个 `new Promise(() => {})`），都会以「页面卡死」的形式扩散到所有模块。
