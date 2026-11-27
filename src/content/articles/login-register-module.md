---
title: 登录、注册与退出：小程序手机号快捷登录的真实链路
description: 基于 uni-app 小程序登录模块的真实代码，拆解微信静默登录、手机号快捷登录、注册资料表单校验、401 静默重登与退出时清理访客隐私数据的完整链路。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 登录, 工程实践]
chapter: pages
order: 3
level: deep
featured: false
draft: false
project: robot-forum-miniapp
---

登录模块只有三个页面：`pages/login/index`（登录）、`pages/register/index`（个人信息）、`pages/login-setting/index`（登录设置）。不像预约、论坛那样有复杂的列表和状态同步，它的难点全在时序：什么时候静默登录、什么时候才允许跳转、换账号时旧数据怎么隔离、401 之后怎么补一次请求而不打断用户。

下面还是按五段讲：用户要完成什么、页面怎么走、空和失败怎么处理、界面为什么这样排、代码怎么落地。

## 1. 用户要完成什么

用户在这个模块里只做三件事：

1. 登录。不填账号密码，点一次「快捷登录」，授权手机号就完成。
2. 补资料。注册成功后进入「个人信息」，填头像、姓名、邮箱、公司、地区、详细地址、应用领域、角色。
3. 退出。在「我的 → 登录设置」里确认退出，清掉本地登录态和访客隐私数据。

登录页本身没有输入框。模板里只有一个 logo、一行标语和一枚按钮：

```html
<button type="default" class="btn fs14 fc" hover-class="hover" open-type="getPhoneNumber"
  @getphonenumber="getPhoneNumber">
  快捷登录
</button>
```

`open-type="getPhoneNumber"` 是微信原生能力，用户点按钮后由微信弹出手机号授权面板，回调里拿到的不是手机号，而是一次性 `code`。

从入口看，登录不是启动页：`pages.json` 的第一项是 `pages/index/index`，登录页只是普通页面，也不在 tabBar 里。用户通常从三个地方被带过来：

| 入口 | 触发条件 | 行为 |
| --- | --- | --- |
| 首页 / 机器人应用的 `checkAuth` | 无 token，或 token 有但昵称没填 | 弹窗「当前操作需要登录 / 去登录」，或「需要完善个人信息 / 去完善」 |
| 我的卡片 `mine-card` | 点头像区 | 有 token 去 `register`，没 token 去 `login` |
| 接口 401 | 请求返回 `code == 401` | toast「登录已过期，需重新登陆」后跳登录页 |

## 2. 页面要怎么走

### 登录页一进来就先试静默登录

`onShow` 不是等用户点按钮，而是先自动试一次：

```js
onShow() {
  this.action = "autoLogin"
  uni.showLoading({ title: "" })
  this.wxLogin()
}
```

`wxLogin()` 调 `wx.login` 拿临时 `code`，再请求 `getSessionIdApi(code)`，即 `GET /sessionId/{code}`，这个接口 `auth` 传的是 `false`，不需要 token。

拿回结果后按 `action` 分流：

- `autoLogin`：如果 `res.token` 存在，写入 token、绑定访客身份、toast「登录成功！」，1.5 秒后 `navigateBack` 回上一页。如果 `token` 不存在，只 `hideLoading()`，不跳转、不提示——用户看到的就是登录页和那枚「快捷登录」按钮。代码注释也确认这是预期：该微信用户在后端还没注册/绑定，必须走手机号授权。
- `register`：必须有 `res.wxSessionId`，拿到后调用 `register()`。

### 点按钮之后才真正注册

`getPhoneNumber(e)` 把微信回调里的 `e.detail.code` 存到 `this.code`，把 `action` 切成 `register`，再跑一次 `wxLogin()`。也就是说，两次 `wx.login` 拿到的 `code` 用途不同：第一次只换 token，第二次连同手机号 `code` 一起换注册结果。

`register()` 调 `registerApi({ code, wxSessionId })`，即 `POST /authLogin`。成功拿到 `token` 后：

```js
setToken(res.token)
await this._bindVisitIdentity();
uni.hideLoading()
uni.showToast({
  title: "登录成功！",
  success: () => {
    setTimeout(() => {
      uni.redirectTo({ url: `/pages/register/index` })
    }, 1500)
  }
})
```

注意这里用的是 `redirectTo` 而不是 `navigateBack`：注册成功后要直接进入「个人信息」，登录页从栈里替换掉，用户返回时不会再回到登录页。

### 注册资料页的加载顺序

`pages/register/index` 的导航标题是「个人信息」。`onLoad` 调 `initData()`，用 `loading` 标志加 1 秒定时器做防抖，然后依次 `getRoleList()` 和 `getUserInfo()`：

```js
async initData() {
  if (!this.loading) {
    this.loading = true;
    setTimeout(() => { this.loading = false; }, 1000)
    await this.getRoleList()
    await this.getUserInfo()
    this.loading = false;
  }
}
```

`onShow` 里还有一层：`roleList` 为空就再拉一次角色。首次进入时 `onLoad` 和 `onShow` 几乎同时触发，若 `initData` 的 `getRoleList` 还没返回，`onShow` 会再发一次同样的请求。这是代码现状，不影响结果，但同一个接口确实可能被请求两次。

`getRoleList()` 拉 `GET /system/role/getWxRoleList`，只保留 `status == "0"` 的角色，并且只取 `roleId / roleName / status` 三个字段（`"0"` 是后端返回的字符串，不是数字）。

`getUserInfo()` 拉 `GET /system/user/profile`，把已有资料回填到各个表单项；`roleGroup` 交给角色组件 `init()`，它按逗号拆分后统一加「我是」前缀。

### 提交与退出

`confirmClick()` 先做非空校验，通过后 `PUT /system/user/profile`，toast「保存成功！」，1.5 秒后 `navigateBack`。

退出在 `pages/login-setting/index`：页面只有一个「退出登录」按钮，点击弹 `up-modal`（内容「确定退出登录吗？」，`confirmColor="#0047bb"`），确认后：

```js
removeToken();
try { clearVisitorStorage(); } catch (e) { /* 清理失败不阻塞登出 */ }
uni.showToast({ title: "已退出登录", icon: "none", success: () => {
  setTimeout(() => { uni.navigateBack() }, 1500)
}})
```

`removeToken()` 删的是 storage 里的 `yj-token`；`clearVisitorStorage()` 删的是访客模块的全部本地 PII，包括身份桶、设备随机命名空间桶、老版本全局桶、`visitLastForm`、`visitTimeSelection` 和受访人缓存。这两件事分开做，是因为前者是登录态，后者是隐私数据，不能只删一个。

## 3. 空和失败怎么处理

登录链路里失败分支很多，但处理粒度不一致，这一点看代码比看设计更清楚：

| 场景 | 代码行为 |
| --- | --- |
| `wx.login` 本身失败 | 只 `console.error("wx.login|fail", err)`，不 toast，也没有 `hideLoading` |
| `/sessionId/{code}` 请求异常 | `hideLoading` + toast「网络异常，请重试」 |
| 静默登录返回 `token: null` | `hideLoading`，不跳转不提示，停在登录页 |
| 注册时没拿到 `wxSessionId` | `hideLoading` + toast「登录失败，请重试」 |
| `/authLogin` 没返回 token | `hideLoading` + toast「获取token失败」，`icon: "error"` |
| `/authLogin` 抛异常 | `hideLoading` + toast「注册失败，请重试」 |
| 绑定访客身份失败 | 只 `console.warn`，不阻断登录 |

`_bindVisitIdentity()` 单独说明一下：它在 token 就绪后立刻拉一次 `getUserInfoApi()`，用后端稳定的 `userId` 调 `setVisitUserIdentity(uid)`，在返回上一页之前完成身份桶切换。失败不阻塞登录，首页的 userInfo mixin 还会再兜底绑一次。顺序是刻意的——如果先 `navigateBack` 再绑定，访客页 `onShow` 读到的还是上一个账号的身份桶。

注册资料页的校验只有「非空」：

```js
if (this.formData.nickName == "") { this.$refs['namePld'].showTip = true; hasEmpty = true; }
if (this.formData.email == "") { this.$refs['emailPld'].showTip = true; hasEmpty = true; }
if (this.formData.company == "") { this.$refs['companyPld'].showTip = true; hasEmpty = true; }
if (this.formData.applicationArea == "") { this.$refs['fieldPld'].showTip = true; hasEmpty = true; }
if (this.formData.roleIds == "") { this.$refs['rolePld'].showTip = true; hasEmpty = true; }
```

邮箱没有格式校验，代码里也没有任何正则。`roleIds` 是数组，`[] == ""` 在 JS 里成立，所以「没选角色」能命中这个分支；选了角色后数组非空，比较为 `false`。

公司地区和详细地址的校验代码是被注释掉的，对应模板上的 `must` 也没加，所以这两项实际可选。

`showTip` 的效果也不是红框报错：`components/form-item/index.vue` 里它只是把 `placeholder` 文案显示在行下方，靠 `v-show` 切换。

角色弹窗在角色列表为空时没有任何空态文案，`v-for` 渲染零行，用户看到的是一个空白弹层。这是代码现状，不是遗漏描述。

另外，`confirmClick()` 里对 `updateUserInfoApi` 没有 `try/catch`。接口失败时，请求层会按默认 `toast: true` 弹出后端返回的错误信息，但页面不会回滚 `loading`，也不会停在原地做二次提示。

## 4. 界面为什么这样排版

登录页是最小信息量的单点页面：

- `.content` 绝对定位在 `top: 30%` 再 `translateY(-50%)`，视觉重心比几何中心偏上。小屏上内容不会贴着顶部，也不会被底部安全区顶住。
- logo 宽 `220rpx`，用 `mode="widthFix"` 保持比例；下面一行 `fs14` 的灰字「全球先进的智能机器人研发制造商」作为品牌说明，不参与交互。
- 按钮距标语 `margin-top: 100rpx`，把唯一的操作和品牌区拉开，避免误触；高度 `80rpx`、宽度 `400rpx`、圆角 `40rpx`，是标准的胶囊按钮尺寸。
- 按钮底色是 `#52C41A` 绿色，而导航栏、我的卡片用的是品牌蓝 `#0047bb`。登录页刻意用了不同于品牌蓝的高饱和绿，让唯一操作在白色页面里最醒目；`hover-class` 用 `darken(#52C41A, 5%)` 做按压反馈，而不是透明度变化。

注册页是标准的单列表单：外层 `padding: 40rpx`，每行左侧标题、右侧控件，必填项在标题前加红色星号（`must` 控制），提示文案固定在行下方。输入类、选择类、搜索类控件统一走 `j-form-item` 插槽，所以对齐和间距由一处控制。

退出页则把唯一的危险操作固定在 `top: 80%`：

```scss
.btn-box {
  width: 100%;
  position: fixed;
  top: 80%;
  transform: translateY(-50%);
  left: 0;
  padding: 0rpx 76rpx;
}
```

远离顶部导航和内容区，减少误触；确认弹窗的确认色用品牌蓝 `#0047bb`，和全局导航色一致，而不是用红色，说明产品把它定位成「设置操作」而不是「危险删除」。

## 5. 代码怎么落地

### token 存哪、怎么带上

`tools/token.js` 只有三个函数，key 固定为 `yj-token`：

```js
export const getToken = () => uni.getStorageSync('yj-token')
export const setToken = (token) => uni.setStorageSync('yj-token', token)
export const removeToken = () => uni.removeStorageSync('yj-token')
```

请求拦截器里，`auth` 为真或已有 token 时，直接把 token 原样塞进 `Authorization` 头（没有 `Bearer` 前缀）。`auth === true` 且没有 token 时，不发请求，直接 `reject({ code: 401, msg: "未登录或登录已过期" })`，让业务层统一处理。

### 401 的静默重登

响应 `code == 401` 时，包装层不会直接失败，而是先看有没有 token：

- 有 token：调 `silentLogin401(cb)`，内部用 `wx.login` + `/sessionId/{code}` 换新 token；成功后把原请求重放一次。
- 没有 token：直接 `reject`，交给调用方。

`silentLogin401` 做了单例和等待队列：首页 `onLoad` 会并发发出多个 `auth: true` 请求，如果每个 401 都各自触发一次 `wx.login`，回调会互相覆盖，部分请求永远挂起。现在的实现是同一时刻只跑一次静默登录，其余调用方共享结果：

```js
if (_silentLoginPending) {
  _silentLoginWaiters.push(cb)
  return
}
_silentLoginWaiters.push(cb)
_silentLoginPending = _doSilentLogin()
```

如果静默登录拿到的是 `token: null`，代码不当作错误——只说明这个微信用户还没注册。此时置 `_lastSilentLoginResult = false`，并复用 `toLogin401()` 引导去登录页；已经在登录页时不再跳转，避免重复入栈。

### 三个页面的分工

| 页面 | 路由 | 职责 |
| --- | --- | --- |
| 登录 | `pages/login/index` | 静默登录、手机号授权、注册、写 token、绑定身份 |
| 个人信息 | `pages/register/index` | 角色列表、资料回填、非空校验、保存资料、上传头像 |
| 登录设置 | `pages/login-setting/index` | 退出确认、删 token、清访客 PII |

### 接口清单

| 动作 | 接口 | 鉴权 |
| --- | --- | --- |
| 微信 code 换 token | `GET /sessionId/{code}` | 否 |
| 手机号注册 | `POST /authLogin` | 否 |
| 角色列表 | `GET /system/role/getWxRoleList` | 是 |
| 用户资料 | `GET /system/user/profile` | 是 |
| 保存资料 | `PUT /system/user/profile` | 是 |
| 上传头像 | `POST /common/upload` | 是 |
| 公司模糊搜索 | `GET /biz/qiXin/company` | 否 |

### 一个容易被忽略的细节

注册页回填角色时，`role.init()` 把 `roleGroup` 按逗号拆开后统一拼成「我是XX」；但角色组件渲染选项时，对「其他」这个角色名不加前缀。两边规则不一致，如果后端存过「其他」，回填时就匹配不上，选项不会显示为已选。这是从代码里能直接读出来的现状，不是猜测。

---

这个模块的代码量不大，但把「登录态」拆成了三层：token 是凭证，`userId` 是访客数据的身份桶钥匙，`clearVisitorStorage()` 是隐私清理开关。三层各管一段，登录、换号、退出才不会互相污染。真正需要小心的是顺序——先写 token，再绑身份，最后才允许页面返回；少一步，用户看到的就是上一个账号的数据。
