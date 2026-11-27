---
title: 直连魔点：19 位 Long、两套 token，和一条借来的签到码
description: 基于 tools/moredian.js、tools/config.js 与 api/index.js 的真实源码，拆解小程序绕过自家后端直连魔点 v5 的整条传输层——19 位 Long 为什么要先把 JSON 改写成字符串、ioapi 与 toapi 两套 token 各管什么、010170022 为什么只重试一次、签到码为什么必须找 Node 服务要，以及配置为空串、operatorId 硬编码、状态字段用 ?? 链读不到等真实问题。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 网络层, 访客系统]
chapter: foundation
cover: /images/chapters/foundation.svg
order: 4
level: practice
featured: false
draft: false
project: robot-forum-miniapp
---

上一篇拆的是访客预约的页面：怎么选时段、怎么提交、记录页怎么分组。这一篇往下走一层，拆页面踩着的那块地板——`tools/moredian.js`，572 行，负责让一个小程序直接跟门禁厂商的开放平台对话。

这块地板有意思的地方在于：它同时要处理三个系统（魔点 v5、钉钉版 toapi、自家 Node 服务），而这三个系统的 ID 精度、鉴权方式、能查到的字段都不一样。

## 1. 用户要完成什么

用户在访客模块里只有四个动作：填表提交预约、出示二维码签到、在记录页看状态、给人脸补一张照片。

这四个动作在代码里要跨过四个系统：

| 用户动作 | 实际经过的系统 | 谁说了算 |
| --- | --- | --- |
| 提交预约 | 小程序 → ioapi.moredian.com `/oapi/v5/visitor/createVisitorReservation` | 魔点 |
| 出示二维码 | 小程序 → Node 服务取签到码 → 拼二维码 URL | Node 服务 |
| 看预约状态 | 小程序 → Node 服务 `/api/visit/info/:id` | Node 服务 |
| 上传人脸 | 小程序 → ioapi.moredian.com `/oapi/v5/visitor/updateFaceImage` | 魔点 |

这张表解释了后面所有的复杂：**能写的地方不能读，能读的地方不能写**。魔点能创建预约、能收人脸，但它的 v5 查询接口拿不到签到码；签到码在魔点发给访客的短信里，只有 Node 服务通过魔点回调落了库，才能反查出来。

## 2. 页面要怎么走

### 2.1 一条创建请求要过四道关

提交页只调一个函数：

```js
// pages/visit/submit.vue:1434
const res = await visitCreateApi({
  ...baseData,
  startTime: this.toTimeValue(periods[i].startTime),
  endTime: this.toTimeValue(periods[i].endTime)
});
const rid = (res && (res.visitRecordId || res.appointmentId)) || "";
if (!rid) throw new Error("创建访客预约未返回预约ID");
```

再往下是四层：`api/index.js:762-773` 的 `visitCreateApi` → `requestMoredian` → `_requestWithTokenRetry` → `send`。

`send` 是整层的地基，它做了一件很关键的事：

```js
// tools/moredian.js:103-116
function send({ url, method = "GET", data = null, header, timeout = 15000, keepRawBody = false }) {
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method,
      data,
      header: header || { "content-type": "application/json" },
      timeout,
      // 关键：以 text 接收，避免 19 位 Long 在框架 JSON.parse 阶段丢精度
      dataType: "text",
      success: (res) => {
        const body = parseSafeJson(res.data);
```

`dataType: "text"` 不是随手写的。下一节解释原因。

### 2.2 两套 token，两个平台，四次单飞

配置里有两组凭据，因为它们属于两个互不相通的平台：

```js
// tools/config.js:20-40（节选）
export const moredian = {
  baseUrl: "https://oapi.moredian.com",
  baseUrlIo: "https://ioapi.moredian.com",
  baseUrlToapi: "https://toapi.moredian.com",
  appId: "1876584582384451584",
  appKey: "",
  toapiAppId: "1876852467799425024",
  toapiAppKey: "",
  orgId: "1868663614441783296",
  orgAuthKey: "",
};
```

`moredian.js` 为此维护了四个缓存值和四个在途 Promise：

```js
// tools/moredian.js:19-36
let _appToken = null;
let _accessToken = null;
let _expire = 0;
let _accessExpire = 0;

let _toapiAppToken = null;
let _toapiAccessToken = null;
let _toapiAppExpire = 0;
let _toapiAccessExpire = 0;

let _appTokenPending = null;
let _accessTokenPending = null;
let _toapiAppTokenPending = null;
let _toapiAccessTokenPending = null;
```

这就是常说的 single-flight：并发调用时只有一个请求真的发出去，其余都复用同一个 Promise。

```js
// tools/moredian.js:180-190
export async function getAccessToken() {
  if (_accessToken && Date.now() < _accessExpire) {
    return _accessToken;
  }
  // 已有在途请求 → 复用（这是「并发取 token」的唯一收敛点：
  // 所有业务接口都经 getAccessToken，故此处的单飞覆盖全链路）
  if (_accessTokenPending) {
    return _accessTokenPending;
  }
```

`getAccessToken` 自己还有两条路径：配置了 `orgAuthKey` 走内部应用 `getOrgAccessToken`，没配置就走外部应用 `getAppToken` + `getAccessToken`。当前仓库里 `orgAuthKey` 是空串，所以实际生效的是第二条。

### 2.3 19 位 Long 不能过 JSON.parse

魔点的所有 ID——personId、addressId、预约 ID——都是 19 位 Long，超过 `Number.MAX_SAFE_INTEGER`。如果直接让 `uni.request` 按 JSON 解析，末位会被抹平。

文件头的注释说得更具体：**实测 6 个真实 ID 中 5 个失真**。

所以这一层不用框架的 JSON 解析，而是先拿原文，再在解析之前做一次文本改写：

```js
// tools/moredian.js:48-83（节选）
export function protectBigInt(json) {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < json.length; i++) {
    const c = json.charAt(i);
    if (inStr) {
      // 字符串内部原样保留，避免误改 "备注:1234567890123456" 这类内容
      out += c;
      if (esc) {
        esc = false;
      } else if (c === "\\") {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    // ...
    if (c === "-" || (c >= "0" && c <= "9")) {
      let j = i;
      while (j < json.length && /[0-9eE+.\-]/.test(json.charAt(j))) j++;
      const num = json.slice(i, j);
      out += /^-?\d{16,}$/.test(num) ? '"' + num + '"' : num;
      i = j - 1;
      continue;
    }
    out += c;
  }
  return out;
}
```

它手写了一个极简状态机：字符串里的内容一律不动（避免把备注里的长数字也加引号），字符串外凡是 16 位以上的连续整数，整体加上引号降级成字符串。这样 `JSON.parse` 之后 ID 还是原文。

这个约束甚至影响到了创建接口的返回值。`api/index.js` 的注释记录了一次 curl 实证：

```js
// api/index.js:756-772（节选）
// ⚠️ 魔点 create 真实返回体 curl 实证: {"data": <裸Long>, "result": "0", "message": "..."}
//    data 就是一个裸的 19 位 Long = appointmentId；响应体里**根本不存在** visitRecordId 字段。
export const visitCreateApi = async (data) => {
  const res = await requestMoredian("/visitor/createVisitorReservation", "POST", data)
  if (res === undefined || res === null) throw new Error("魔点未返回预约ID")
  const rid = String(res)
  if (!rid) throw new Error("魔点未返回预约ID")
  return {
    visitRecordId: rid,
    appointmentId: rid
  }
}
```

只返回一个裸 ID，于是 `visitRecordId` 和 `appointmentId` 同值兜底。但这两个字段在后端不是一回事——注释里明确写了：`visitRecordId` 是 Node 服务索引用的字段，需要 Node 侧补 `appointmentId` 的查询 fallback。

### 2.4 签到码不在魔点这条链上

这是整层最反直觉的地方。魔点明明有「查访客预约」的接口，但查不到签到码：

```js
// tools/moredian.js:400-411（节选）
// ⚠️ 实测结论：成功响应**只有** {appointmentId, visitorExtId}，
// 不含 status/visitorCode/respondentName/startTime/endTime —— 本直连方案无法据此刷新状态或签到码。
export async function getVisitorDetail(appointmentId) {
  if (appointmentId === undefined || appointmentId === null || appointmentId === "") {
    throw new Error("缺少 appointmentId");
  }
  return requestMoredian("/visitor/get", "GET", null, { appointmentId });
}
```

另一条路是钉钉平台 `toapi` 的 `/visitor/getRecordInfo`，它确实会返回 `certificateContent`（含签到码的短信原文），但注释写明两个前提：这个接口只存在于 toapi；机构没开通钉钉平台授权时会恒返 `010170025`。

于是最终方案是第三条路——问自家 Node 服务：

```js
// api/index.js:1603-1623（节选）
export function fetchNodeVisitInfo(aid, timeoutMs, force) {
  const target = String(aid || "")
  if (!target) return Promise.resolve(null)

  const timeout = (timeoutMs && timeoutMs > 0) ? timeoutMs : 8000
  return new Promise((resolve) => {
    uni.request({
      url: `${NODE_VISIT_BASE}/api/visit/info/${encodeURIComponent(target)}`,
      method: "GET",
      timeout,
      // 关键：以 text 接收，避免 19 位 Long 在框架 JSON.parse 阶段丢精度
      dataType: "text",
```

注意这个函数的三条设计：**永不 reject**（失败、超时、非 200 都 resolve `null`）；**只缓存成功**（`node !== null` 才写 TTL 10 秒的模块级缓存）；**超时可传**（二维码页首屏 8000ms、进页面后 5000ms、取消前的预检 3000ms）。

签到码字段名还专门收敛成一个函数，因为 Node 和本地 storage 的字段名不一定一致：

```js
// api/index.js:1691-1694
export function pickVisitCheckcode(obj) {
  if (!obj || typeof obj !== "object") return "";
  return String(obj.visitorCheckCode || obj.visitorCode || obj.visitorCheckcode || obj.checkCode || "") || "";
}
```

### 2.5 二维码 URL 是逆向出来的

二维码内容不是魔点文档给的，是从访客 H5 里反推出来的。`api/index.js` 用了 30 多行注释记录这条推理链：

```js
// api/index.js:1128-1138
/**
 * 构建访客签到二维码内容
 * ✅ 唯一正确格式: imagicube.moredian.com/?corpId=<机构ID>&code=<签到码>
 */
export function buildVisitorQrUrl(checkcode) {
  if (!checkcode) return ""
  return `https://imagicube.moredian.com/?corpId=${VISITOR_CORP_ID}&code=${encodeURIComponent(String(checkcode))}`
}
```

注释里还记录了中间步骤：先 `shortlink/message` 用短码换 orgId 和 visitorId，再 `baseMessage` 拿 `visitorCheckCode`，最后按 `corpId` + `code` 拼 URL；并且特别标注 `corpId` 是魔点 orgId，不是钉钉的 `ding...` 短 hash，历史上曾误写成 `1833418520390533120`。

### 2.6 人脸走 uploadFile，不能预编码

人脸是文件，`uni.request` 发不了，必须另开一条传输通道：

```js
// tools/moredian.js:467-476
function sendFile({ url, filePath, name = "file", formData = {}, header, timeout = 30000 }) {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url,
      filePath,
      name,
      formData,
      // ⚠️ 不传 header —— 微信会自动加 Content-Type: multipart/form-data; boundary=xxx
      // 如果传了 header: {} 空对象，可能阻止 boundary 注入，导致魔点无法解析 multipart body
      timeout,
```

这条通道和 `send` 是同构的：同样注入 accessToken、同样 `parseSafeJson`、同样 `010170022` 自愈一次；但有一个看似反常的处理——query string **不做** `encodeURIComponent`：

```js
// tools/moredian.js:521-528
const merged = { ...(params || {}), accessToken };
// ⚠️ 不在此处 encodeURIComponent —— uni.uploadFile 会对 URL 做一轮自动 encode，
// 预先 encode 会导致双重编码（accessToken 里的 + → %2B → 再被编成 %252B），魔点解码后不匹配 → token 无效。
const qs = Object.keys(merged)
  .filter((k) => merged[k] !== undefined && merged[k] !== null)
  .map((k) => `${k}=${merged[k]}`)
  .join("&");
```

同一层里，`send` 编码了，`sendFile` 不编码。差异有据可依（`uni.uploadFile` 自动编码），但这种「相邻函数规则相反」的写法，是维护时最容易改错的地方。

## 3. 空和失败怎么处理

这一层的错误处理策略可以概括成一句话：**能兜底就兜底，兜不住就把原因原样抛给页面**。

| 失败点 | 代码返回 | 用户看到 |
| --- | --- | --- |
| 缺 appId/appKey | `throw new Error("缺少魔点 appId/appKey 配置")` | 提交失败：缺少魔点 appId/appKey 配置 |
| 网络层失败 | 先取 `err.errMsg`，再取 `err.message`，最后兜底「魔点请求失败（网络异常）」 | 提交失败：request:fail timeout || 响应非 JSON | `reject(new Error("魔点返回解析失败"))` | 提交失败：魔点返回解析失败 |
| 业务码非 0 | `err.code = body.result`，抛出 `body.message` | 提交失败：魔点原始提示 |
| token 失效 010170022 | 清缓存，重试一次 | 用户无感 |
| 查详情 010190044 | `visitDetailApi` 捕获后返回 `null` | 无提示，继续用本地数据 |
| Node 超时/失败 | `fetchNodeVisitInfo` resolve `null` | 二维码页继续轮询，记录页沿用本地状态 |
| 终态 2/3/4 | 不出码 | 「预约已签到，无法出示二维码」 |

### 3.1 token 自愈只给一次机会

```js
// tools/moredian.js:361-375（节选）
try {
  return await send({ url, method, data, keepRawBody: !!(options && options.keepRawBody) });
} catch (e) {
  if (triesLeft > 0 && e && e.code === "010170022") {
    if (useToapi) {
      _clearToapiTokenCache();
    } else {
      _accessToken = null;
      _accessExpire = 0;
    }
    return _requestWithTokenRetry(path, method, data, params, triesLeft - 1, customBaseUrl, options);
  }
  throw e;
}
```

注释解释了为什么必须自愈：同一 `appId + orgId` 只保留一个有效 token，`getOrgAccessToken` 会让旧 token 立即失效（多客户端互相踢下线），不清缓存就会一直失败到 2 小时后过期。

也只重试一次。如果重试还失败，说明不是 token 过期，继续重试只会变成风暴。

### 3.2 1565 个受访者：首屏 200，其余后台

受访者列表是这一层里唯一「必须牺牲完整性换速度」的地方。魔点 v5 的分页接口只返回 `personId` 和 `tpPersonId`，没有姓名；要姓名只能逐个 `getPerson`。而机构有 1565 人。

`config.js` 头注释里写了实测代价：**约 18 秒**。

所以 `api/index.js` 做了三段式：

```js
// api/index.js:1060-1095（节选）
export const visitRespondentListApi = async () => {
  const cached = readRespondentCache()
  if (cached) {
    if (!cached.complete) startBackgroundRespondentHydrate()
    return cached.list
  }
  const stale = readRespondentCache(true)
  if (stale) {
    startBackgroundRespondentHydrate()
    return stale.list
  }
  // 冷启动单飞：onLoad 的「预热姓名索引」与用户点开选择器几乎同时触发本函数
  if (_respondentListPending) return _respondentListPending
  _respondentListPending = (async () => {
    ...
    const first = await hydrateRespondents(_respondentIds.slice(0, RESPONDENT_FIRST_CHUNK), null)
```

首屏 200 人先返回、后台补齐、未补全时缓存 30 分钟（补全后 7 天）、冷启动单飞，四个策略叠在一起，才把「点开选择器」的等待压到约 2 秒（`RESPONDENT_FIRST_CHUNK = 200`，`api/index.js:854-859`）。

### 3.3 二维码页的三道终态闸门

二维码页在拿到码之前，要连续通过三道检查，任何一道判定为终态就直接显示空态，不再问 Node：

1. 本地 storage 里的 `moredianStatus` 是 2/3/4 → 直接空态；
2. Node 返回的状态是 2/3/4 → 空态（Node 比 storage 新）；
3. Node 和 storage 都没有码 → 按 `[3000, 6000, 12000]` 轮询三次，还没有就空态。

```js
// pages/visit/qrcode.vue:112
const POLL_INTERVALS = [3000, 6000, 12000];
```

这里的设计意图很清楚：**「没有码」和「码还没生成」是两件事**，前者立刻结束，后者给 21 秒的机会。

## 4. 界面为什么要这样排版

### 4.1 先创建再绑脸

提交页把流程拆成两个明确阶段，原因不在 UI，在上面那条创建接口：一次创建只返回一个裸 ID，而人脸必须按单条 `appointmentId` 上传。

```js
// pages/visit/submit.vue:1544-1548（节选）
// 并发池绑定人脸：魔点按单条预约 rid 独立绑定，无法"一次上传多单"，
// 因此 N 条预约仍需上传 N 次，但可并行提速。
// 用固定并发（CONCURRENCY）同时推同一张图到各 rid，避免 N 次串行耗时；
const CONCURRENCY = 2;
```

于是用户能看到「正在提交预约 2/3」和「正在绑定人脸 2/3」两个不同的进度语义，而不是一个笼统的「提交中」。

### 4.2 失败只报第一个错误码

多段预约并发绑脸，失败可能是 N 条，但提示只留一条：

```js
// pages/visit/submit.vue:1568-1570（节选）
if (!firstFaceFailCode && fe && fe.code && fe.code !== "010140006") {
  firstFaceFailCode = String(fe.code);
}
firstFaceFailMsg = firstFaceFailMsg || String((fe && fe.message) || "上传失败");
```

`010140006` 被单独排除，说明它是「这张脸已经绑过了」这类不需要打扰用户的结果。而同一个原因通常会让 N 条一起失败，所以只报第一条，避免弹 N 个 toast。

### 4.3 三个页面共用一套时效文案

二维码页、记录页、详情页都会显示「什么时候可以签到」，它们共用同一个判定函数：

```js
// api/index.js:1740-1741
export const QR_VALID_BEFORE_HOURS = 2; // 开始前 N 小时内可出示二维码
export function checkQrValidWindow(item) {
```

返回 `ok / tooEarly / tooLate` 三种原因，页面各自翻译成文案。这也是本项目里少见的一处「规则集中、文案分散」的正面例子。注释里还列了第四种 `noTime`，但实现从未返回它——缺时段字段时函数直接按 `ok` 兜底（`api/index.js:1790-1791`），代码与注释在这里是冲突的。

### 4.4 轮询 3/6/12 秒后认输

二维码页的 loading 不会无限转。三次轮询的总时长是 21 秒，之后关掉 loading、显示空态。对用户来说，「等 21 秒然后明确告诉你没有码」比「一直转圈」更容易理解。

## 5. 代码怎么落地

### 5.1 四层分工

| 层 | 文件 | 只负责 |
| --- | --- | --- |
| 配置 | `tools/config.js` | 域名、appId、orgId 等常量 |
| 传输 | `tools/moredian.js` | token、编码、重试、multipart |
| 业务语义 | `api/index.js:738-820` | 返回值归一、兜底、字段名映射 |
| 交互 | `pages/visit/*` | 进度、toast、空态、轮询 |

这条分层是清晰的：页面里没有出现过 `accessToken`、`010170022`、`multipart` 这些词。

### 5.2 六条实现要点

1. **大整数要从解析前处理**：`dataType: "text"` + 手写状态机，而不是事后修补。
2. **token 收敛到一个入口**：所有业务接口都经 `getAccessToken`，单飞才有意义。
3. **自愈只重试一次**，并且把错误码挂到 `err.code` 上，否则调用方无从判断。
4. **`uploadFile` 的 URL 不要预编码**，`request` 的要编码——两条通道规则不同。
5. **不可用的数据源要能被替换**：签到码从 v5 换到 toapi 再换到 Node，页面代码一行没改。
6. **跨系统的 ID 一律 `String()`**，从 `protectBigInt` 到 `visitCreateApi` 到页面，全程不转 Number。

### 5.3 记录的真实问题

| # | 问题 | 证据 |
| --- | --- | --- |
| 1 | 仓库里 `appKey`、`toapiAppKey`、`orgAuthKey` 全是空串，且没有任何代码读取 `config.local.example.json`（全项目搜 `config.local` 零命中）；当前快照下直连必然抛「缺少魔点 appId/appKey 配置」 | `config.js:28-40` |
| 2 | 配置注释自己承认 appKey 随代码包下发等同公开，持有即可调用全机构接口，方案仍然保留 | `config.js:14-19` |
| 3 | 取消预约硬编码 `TP_OPERATOR_ID = "0101526866658287"`，所有取消都记在同一个人名下，审计无法区分操作者 | `moredian.js:440-449` |
| 4 | `VISITOR_CORP_ID` 与 `config.moredian.orgId` 是同一值的两份副本，注释记载历史上曾写错一次 | `api/index.js:1126` |
| 5 | `send()` 不检查 `statusCode`，非 200 且非 JSON 时统一报「魔点返回解析失败」，而同层的 `sendFile()` 会报 `HTTP xxx` | `moredian.js:115-134` |
| 6 | token 自愈用 `e.code === "010170022"` 字符串全等，但 `isOk` 专门兼容了「魔点偶发返回数字」；若错误码也是数字，自愈不会触发 | `moredian.js:38-41`、`364` |
| 7 | `pickVisitStatuses` 用 `??` 链读 `status → visitStatus → recordStatus`；`node.status` 为空串时不会继续取后面的字段，最终返回 `undefined` | `api/index.js:1709-1719` |
| 8 | `getAccessToken` 的 appToken 分支注释自认「路径名待按文档核实」，而它正是当前配置下唯一生效的分支 | `moredian.js:206-212` |
| 9 | toapi 的 `getToapiToken`、`getToapiAppToken`、`getVisitorRecordInfo` 自述「已无调用方」，仍保留在文件中 | `moredian.js:7-8`、`230-282` |
| 10 | 二维码 2 小时窗口是前端常量，不来自服务端；前端判「有效」不代表设备端同意 | `api/index.js:1740` |
| 11 | `_nodeCache` 只写不删，没有上限也没有失效清理 | `api/index.js:1593-1594` |
| 12 | `checkQrValidWindow` 的 JSDoc 声明了 `noTime` 返回值，实现里缺时段字段时直接返回 `ok`，该分支永远走不到 | `api/index.js:1741-1792` |

第 5 到第 7 条是我在读代码时能直接推导出来的；第 1 条是当前仓库快照的事实，不代表打包时不会另行填入密钥。

### 5.4 验证

- `npm test`：130 项通过。
- `npm run check`：80 个文件，0 error / 0 warning / 0 hint。
- `npm run build`：Pagefind 索引 82 页、21586 词。
- `npm run test:build`：构建冒烟 20 项全部通过。
- 产物：`dist/articles/moredian-direct-connect-module/index.html`、`dist/og/articles/moredian-direct-connect-module.png`。

这一层没有自己的界面，所以它的质量不体现在截图上，而体现在上面那张失败表：每一种失败都有明确归属，用户不会看到裸的 `undefined`。
