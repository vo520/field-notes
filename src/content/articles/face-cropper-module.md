---
title: 人脸裁剪弹层：为 200px 人脸写的五重保险，和一扇没关上的后门
description: 基于 components/face-cropper 与 tools/facePreprocess.js 的真实源码，拆解 EXIF 方向归一、旧版 canvas 导出、wx.faceDetect 本地预检、取景框像素下限这五重保障，以及 canvas 不可用时静默回退原图这条绕过全部校验的路径。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, canvas, 图像处理]
chapter: components
cover: /images/chapters/components.svg
order: 5
level: deep
featured: false
draft: false
project: robot-forum-miniapp
---

访客预约必须录人脸，而魔点（Dobot 的门禁服务商）对这张照片有一个硬性要求：**画面里人脸的像素尺寸至少 200×200**，否则返回 `010140023「人脸大小至少为200*200」`。注意它校验的是脸，不是图——一张 4000×3000 的半身照，脸只占中间一小块，照样被拒。

这个约束催生了一个 622 行的组件：`face-cropper.vue`，加上一个 142 行的工具库：`facePreprocess.js`。三个页面（`submit.vue`、`detail.vue`、`record.vue`）各自复制了同一段调用代码。

这一篇拆它，因为它是整个项目里唯一一处「用 canvas 做真实像素运算」的地方，也是唯一一处主动调 `wx.faceDetect` 的地方。

## 1. 用户要完成什么

用户在访客预约里点「录入人脸」，流程只有四步：

1. 从相册选一张照片，或直接拍照；
2. 弹层里出现照片，中间一个白色方框，框里画着一个虚线椭圆，提示「让脸部占满方框（额头到下巴贴近边框），只留少量肩膀」；
3. 拖动方框对准脸，拖右下角手柄调整大小；
4. 点「确定」，等一两秒，看到「人脸照片已录入·已优化」。

用户不知道背后发生了什么。但他能感知到的失败有三种：图选不了（太大）、框对不准（预览被压扁）、以及最糟的一种——提示录入成功，到门口刷不上脸。

## 2. 页面要怎么走

### 组件契约

```js
props: {
  visible: { type: Boolean, default: false },
  src: { type: String, default: "" },
  cropperSize: { type: Number, default: OUTPUT_SIZE }  // 720
},
emits: ["confirm", "cancel"],
```

`visible` 为真时整个弹层渲染（模板根节点是 `v-if="visible"`），`src` 变化也会重新 `open()`。三个页面都只传前两个：

```html
<face-cropper :visible="cropVisible" :src="cropSrc"
  @confirm="onCropConfirm" @cancel="onCropCancel"></face-cropper>
```

`cropperSize` 从未被传过，所以导出尺寸恒为 720。

### 页面侧的「假 await」

三个页面用的是同一段代码，`detail.vue` 第 902-907 行：

```js
this.cropSrc = filePath;
this.cropVisible = true;
const cropPath = await new Promise(res => { this._cropResolve = res; });
this.cropVisible = false;
if (!cropPath) return; // 用户取消裁剪
filePath = cropPath;
```

组件不是用 Promise 封装的，页面自己造了一个：把 `resolve` 存到 `this._cropResolve`，等组件的 `confirm` / `cancel` 事件回来时再调它：

```js
onCropConfirm(filePath) {
  this.cropVisible = false;
  const r = this._cropResolve;
  this._cropResolve = null;
  if (r) r(filePath || null);
},
onCropCancel() {
  this.cropVisible = false;
  const r = this._cropResolve;
  this._cropResolve = null;
  if (r) r(null);
}
```

这是一次跨组件的手动 Promise 桥接。它要求「事件恰好回来一次」——多一次会调空的 `null`，少一次则页面永久挂起。

### 打开：先找 canvas，再读图

`open()` 做三件事：重置状态、设 `workSrc = this.src`、按平台分叉。

微信小程序走 `_prepareCanvas(0)`：

```js
_prepareCanvas(tries) {
  uni.createSelectorQuery().in(this)
    .select("#fcExportCanvas")
    .boundingClientRect()
    .exec((res) => {
      const rect = res && res[0];
      if (!rect || !rect.width) {
        if (tries < 6) { setTimeout(() => this._prepareCanvas(tries + 1), 50); return; }
        console.warn("[face-cropper] canvas unavailable, legacy mode");
        this.loadLegacyLayout();
        return;
      }
      this._canvasReady = true;
      uni.getImageInfo({ src: this.src, success: (info) => this._onImageInfo(info), ... });
    });
}
```

canvas 在 `v-if` 内，节点渲染有延迟，所以最多重试 6 次、每次间隔 50ms。**6 次都查不到，就把 `_canvasReady` 留在 `false`，降级成只读尺寸**——这条降级路径的后果在第 3 节讲。

非微信环境走 `loadLegacyLayout()`：只 `getImageInfo`，不查 canvas。

### EXIF 方向归一

`_onImageInfo` 是整个组件里注释最长的函数，因为它踩过一个真机上的坑：

```js
const o = info && String(info.orientation || "").toLowerCase();
if (!o || o === "up" || o === "normal") {
  this.workSrc = this.src;
  this.computeLayout(info.width, info.height);
  return;
}
uni.compressImage({
  src: this.src,
  quality: 95,
  success: (cr) => {
    const normPath = cr && cr.tempFilePath;
    ...
    uni.getImageInfo({ src: normPath, success: (ni) => {
      this.workSrc = normPath;
      this.computeLayout(ni.width, ni.height);
    }, ... });
  },
  fail: (e) => {
    this.workSrc = this.src;
    this.computeLayout(info.width, info.height);
  }
});
```

iPhone 竖拍的照片，物理像素是横着存的，`orientation` 记成 `right`（数值 6）。`getImageInfo` 返回的 `width` / `height` 是**物理尺寸，不交换**，但 `<image>` 预览和 `drawImage` 都会按 EXIF 自动旋正。如果直接拿物理尺寸算布局，预览会被压扁、裁剪坐标按未交换的坐标系换算、`drawImage` 又按旋正后的坐标系解释——用户框住脸，导出的却是错位区域。

解法是用 `compressImage(quality: 95)` 重新编码一次。实测输出 `orientation='up'`、宽高已交换、像素已旋正。之后预览、布局、`drawImage` 全部基于这张无 EXIF 的临时图，坐标系就一致了。

### 布局：一个方形预览区里做 contain

```js
computeLayout(iw, ih) {
  const sys = uni.getSystemInfoSync();
  const winW = (sys && sys.windowWidth) || 300;
  this.box = Math.min(Math.max(winW - 48, 200), 340);
  if (!iw || !ih) { this.ready = false; return; }
  this.imgW = iw; this.imgH = ih;
  const fit = Math.min(this.box / iw, this.box / ih);
  this.dispW = iw * fit; this.dispH = ih * fit;
  this.dispX = (this.box - this.dispW) / 2;
  this.dispY = (this.box - this.dispH) / 2;
  const shortSide = Math.min(this.dispW, this.dispH);
  this.minCrop = Math.min(Math.max(MIN_PX, MIN_SOURCE_PX * fit), shortSide);
  this.srcTooSmall = Math.min(iw, ih) < MIN_SOURCE_PX;
  let cw = clamp(shortSide * DEFAULT_CROP_RATIO, this.minCrop, shortSide);
  this.cropW = cw;
  this.cropX = this.dispX + (this.dispW - cw) / 2;
  this.cropY = this.dispY + (this.dispH - cw) / 2;
  this.ready = true;
}
```

预览区边长是 `窗口宽 - 48`，夹在 200–340px 之间。图片 `contain` 进这个方框，取景框默认取短边的 **72%** 并居中。

0.72 这个数有出处。注释写了一个真实案例：一张正方形半身照，用户没调整直接确定，导出的 720×720 里脸只有 199×199，**差 1px 被魔点拒收**。默认收紧到 72% 后，同一张图的脸大约是 276px。

`minCrop` 是取景框的 css 下限，由 `MIN_SOURCE_PX(240) * fit` 换算——保证框选区域映射回原图至少有 240 真实像素。`srcTooSmall` 更直接：原图短边本身不到 240，怎么裁都不达标，直接标记。

### 交互：拖动 + 右下角手柄

```js
onTouchMove(e) {
  const dx = t.clientX - this._t.sx;
  const dy = t.clientY - this._t.sy;
  if (this._t.type === "move") {
    this.cropX = clamp(this._t.x0 + dx, this.dispX, this.dispX + this.dispW - this.cropW);
    this.cropY = clamp(this._t.y0 + dy, this.dispY, this.dispY + this.dispH - this.cropW);
  } else {
    const max = Math.min(this.dispW, this.dispH);
    this.cropW = clamp(this._t.w0 + Math.max(dx, dy), this.minCrop, max);
    ...
  }
}
```

边框始终是正方形：`cropW` 同时当宽和高用。移动只做边界钳制；缩放只有一个手柄（右下角），用 `Math.max(dx, dy)` 把位移投影成边长变化。

### 导出：旧版 canvas，720 方图

`exportCrop()` 是核心。它先把 css 坐标映射回原图像素：

```js
const fit = this.imgW > 0 ? this.dispW / this.imgW : 0;
const sx = (this.cropX - this.dispX) / fit;
const sy = (this.cropY - this.dispY) / fit;
const ss = this.cropW / fit;   // 取景区域在原图中的真实边长
if (ss < MIN_SOURCE_PX) return { tooSmall: true };
```

然后绘制到一块隐藏的旧版 canvas 上：

```js
const ctx = uni.createCanvasContext("fcExportCanvas", scope);
ctx.drawImage(this.workSrc || this.src, sx, sy, ss, ss, 0, 0, ts, ts);
ctx.draw(false, () => {
  uni.canvasToTempFilePath({
    canvasId: "fcExportCanvas",
    x: 0, y: 0, width: ts, height: ts,
    destWidth: ts, destHeight: ts,
    fileType: "jpg", quality: 0.92,
    success: async (r) => { ... },
    fail: (e) => resolve({ outPath: "", face: null })
  }, scope);
});
```

为什么用旧版 `canvas-id` 而不是 `<canvas type="2d">`？模板里有一段很长的注释：新版节点在微信开发者工具（2.02.2608070 / 基础库 3.16.3、3.17.3 / macOS）里 `canvasToTempFilePath` 必崩，报 `Cannot read properties of undefined (reading 'width')`，随后 appLaunch 超时、小程序重启回首页。旧版接口同环境正常。

旧版画布的坐标系尺寸等于 CSS 尺寸，所以那块 canvas 必须真的占 720×720：

```css
.fc-export-canvas {
  position: fixed; left: 0; top: 0;
  width: 720px; height: 720px;
  opacity: 0; pointer-events: none; z-index: -1;
}
```

不能用 `display: none`，也不能移出屏幕，否则部分安卓机导出空文件。所以它是「视口内透明、压在弹层下面」。

### 三道产出校验

导出成功后立刻读实际像素：

```js
const info = await this._probe(outPath);
if (info.width && (info.width < 200 || info.height < 200)) return { tooSmall: true };
if (drawn.face && drawn.face.min < FACE_MIN_OUTPUT_PX) {
  return { faceTooSmall: true, facePx: Math.round(drawn.face.min) };
}
return { filePath: outPath };
```

`_probe` 是 `getImageInfo` + `getFileInfo` 的组合，任一失败都不阻塞，只缺字段。

`drawn.face` 来自 `_readCanvasAndDetectFace`：从同一块已绘制的画布 `canvasGetImageData` 读 RGBA，交给 `wx.faceDetect`：

```js
return new Promise((resolve) => {
  try {
    wx.faceDetect({
      frameBuffer: buffer, width: size, height: size,
      enableMultiFace: true,
      success: (d) => {
        let rects = [];
        if (Array.isArray(d && d.faceInfo)) {
          rects = d.faceInfo.map(f => f && f.detectRect).filter(Boolean);
        } else if (d && d.detectRect && d.detectRect.width > 0) {
          rects = [d.detectRect];
        }
        let best = null;
        rects.forEach((rc) => {
          if (!best || Math.min(rc.width, rc.height) > Math.min(best.width, best.height)) best = rc;
        });
        if (!best) return resolve(null);
        resolve({ w: best.width, h: best.height, min: Math.min(best.width, best.height) });
      },
      fail: () => resolve(null)
    });
  } catch (e) { resolve(null); }
});
```

多人模式取脸框最大的那张，量它的 `min(width, height)`。`wx.initFaceDetect` 全局只初始化一次，失败后 `_faceReady = false`，本次会话不再尝试——注释写明开发者工具（macOS）和鸿蒙下 `initFaceDetect` 直接 fail，真机（基础库 2.18.0+）可用。

**检测不可用时返回 `null`，调用方一律放行。**

### 五重保障，和它们的实际边界

组件头部注释列了五条：

| 编号 | 措施 | 在代码里的位置 | 逃逸条件 |
| --- | --- | --- | --- |
| ① | 椭圆引导 + 文案 | `.fc-oval` 虚线椭圆 + `.fc-sub` | 用户不看文案 |
| ② | 默认框收紧到短边 72% | `DEFAULT_CROP_RATIO` | 用户主动拉大 |
| ③ | 取景框对应原图真实像素 ≥ 240 | `minCrop` + `ss < MIN_SOURCE_PX` | 原图短边 < 240 时由 `srcTooSmall` 拦 |
| ④ | canvas 真实裁剪，导出 720 JPEG | `exportCrop` | **canvas 不可用时静默回退原图** |
| ⑤ | `wx.faceDetect` 本地预检 | `_readCanvasAndDetectFace` | 检测不可用 / 没检测到脸时放行 |

第 ④ 行的逃逸条件是这篇的重点，第 3 节展开。

## 3. 空和失败怎么处理

**canvas 拿不到，整个裁剪保障静默失效。** `exportCrop` 有两处提前返回：

```js
// #ifndef MP-WEIXIN
console.warn("[face-cropper] non-mp env, fallback original", ...);
return { filePath: this.src };
// #endif
// #ifdef MP-WEIXIN
if (!this.ready || !this._canvasReady) {
  console.warn("[face-cropper] canvas not ready, fallback original", ...);
  return { filePath: this.src };
}
```

返回值带着 `filePath`，`onConfirm` 就当成功处理：

```js
} else if (r && r.filePath) {
  outPath = r.filePath;
}
```

于是用户看到「确定」→ 弹层关闭 → 后续流程继续，**但上传的是未经裁剪的原图**。`_prepareCanvas` 重试 6 次（共 300ms）仍查不到节点时，`_canvasReady` 就是 `false`——这条路径在低端机、页面刚进入时快速选图、或 canvas 被某些容器裁剪的情况下都可能触发。

值得注意的是，`onConfirm` 的守卫只检查 `this.ready`（布局是否算出来），不检查 `_canvasReady`（canvas 节点是否存在）。作者在注释里已经写明了这个风险：

```js
// 图片尚未解码/布局未完成（ready=false）时禁止确定：否则 exportCrop 会回退原图，
// 可能把「大图小脸」的未裁剪照片放出去（下游 200px 校验拦不住），仍会触发 010140023
if (!this.ready) { ... }
```

门是发现了的，只是守卫条件只关上了一半——`ready` 为真而 `_canvasReady` 为假时，两个守卫都放行。

更麻烦的是下游拦不住：`checkFaceImageSize` 只校验**整张图**的宽高 ≥ 200，半身照的整图当然 ≥ 200，于是通过；`checkFaceFileSize` 也只管 2MB。真正能兜住的只有魔点，而魔点的失败表现是「预约创建成功，N 段人脸可后续补录」——用户以为录成功了。

**导出失败时，弹层关掉了，但提示让用户「重试」。** `onConfirm` 的收尾：

```js
if (outPath) {
  this.$emit("confirm", outPath);
} else if (!blockedMsg) {
  blockedMsg = "裁剪失败，请重试";
  this.$emit("cancel");
}
if (blockedMsg) uni.showToast({ title: blockedMsg, icon: "none" });
```

`exportCrop` 抛异常或被 `canvasToTempFilePath` 的 `fail` 兜成 `{outPath: ""}` 时，走 `else if`：先 emit `cancel`（弹层关闭、页面 `return`、整条录入流程终止），再 toast「裁剪失败，请重试」。用户读完这句话，弹层已经没了，也没有「重试」按钮——他得重新点「录入人脸」、重新选图。而 `blockedMsg` 有值的情况（`tooSmall` / `faceTooSmall`）反而不关弹层，两种情况的行为刚好相反。

**图片解码失败时，用户被卡死。** `computeLayout` 在 `iw` 或 `ih` 为 0 时只设 `ready = false` 就返回。此后的表现是：

- 预览区一片黑，没有图（模板里 `<image v-if="ready">`）；
- 点「确定」只弹「图片加载中，请稍候」，而且**永远**是这个提示；
- 唯一出口是「取消」。

`_prepareCanvas` 的 `getImageInfo` fail 和 `loadLegacyLayout` 的 fail 都直接走 `computeLayout(0, 0)`，没有错误文案，也没有重试入口。

**EXIF 归一失败会退回出错的那条路。** `compressImage` fail、或二次 `getImageInfo` fail 时，代码用 `this.src` 配合**原始物理尺寸**布局：

```js
fail: (e) => {
  console.warn("[face-cropper] EXIF normalize compress fail, fallback original", e);
  this.workSrc = this.src;
  this.computeLayout(info.width, info.height);
}
```

这正是注释里描述的那个 bug 现场：预览被压扁、坐标错位、导出的人脸偏小。仅仅是这一次失败，五重保障里的 ①②③ 全部失效，只剩 ④⑤ 在下游兜。

**`wx.faceDetect` 的三种「拿不到结论」都被当成通过。** 接口不存在、`initFaceDetect` 失败、检测成功但没找到脸——三者都 `resolve(null)`，`drawn.face` 为 `null`，`if (drawn.face && ...)` 直接短路。这是有意设计（注释写明「不支持的环境静默放行，由魔点兜底」），但它意味着第 ⑤ 重保障在开发者工具里从不生效。

**预处理那段有一个永远不会命中的分支。** `submit.vue` 第 1828 行：

```js
if (processed && processed.code === "TOO_SMALL") {
  this.tip("图片太小，请重新选择或拍摄");
  return;
}
```

而 `preprocessFaceImage` 的返回值只有三种形态：

```js
// { filePath, size }  压缩/处理成功
// null                处理失败
```

源码里没有 `code` 字段，也没有 `TOO_SMALL` 这个字符串。这个分支是死代码。

**`checkFaceImageSize` 读不到尺寸就放行。** `getImageInfo` fail 时 `resolve({ ok: true })`——包括 `getImageInfo` 本身不可用的 H5 环境。`checkFaceFileSize` 同理，`getFileInfo` fail 时 `ok: true`。两道「硬校验」的名字听起来很硬，实际都有一扇默认打开的门。

**编辑中途退出，页面的 Promise 永远不结算。** 三个页面都是 `await new Promise(res => { this._cropResolve = res; })`，但没有任何 `onUnload` / `onHide` 去调 `_cropResolve(null)`。用户在裁剪弹层上点左上角返回、或按 Home 退出，这个 Promise 就一直挂着，`pickAndPrepFace` 的 `finally` 不执行，`facePreparing` 停在 `true`。`submit.vue` 里这个标志是用来拦截重复点击的：

```js
async pickAndPrepFace() {
  if (this.facePreparing) return;
```

页面实例销毁后影响有限，但如果只是 `navigateTo` 到另一页再回来（页面未销毁），人脸入口就再也点不动了。

**`cropperSize` 传别的值会把图裁掉一块。** 导出时 `ts = cropperSize || 720`，`drawImage` 的目标是 `ts × ts`；但 canvas 的 CSS 尺寸写死 720×720。传 1080 时，绘制内容超出画布，`canvasToTempFilePath` 取 `x:0,y:0,w:1080,h:1080` 会拿到超出边界的空区。目前三个页面都不传，所以是潜在问题而非现症。

**每次裁剪都会打印三条 info 日志。** EXIF 归一、导出结果、失败原因各一条 `console.info` / `console.warn`，真机日志里能直接对照产出是否达标——这是刻意的，不是残留。

## 4. 界面为什么要这样排版

**弹层是居中卡片，不是底部抽屉。** 这个项目里其他弹层（角色选择、公司搜索、发帖）都是 `bottom` 上滑，只有这一个用 `display: flex; align-items: center; justify-content: center`。理由是它需要一块**方形**工作区：底部抽屉的可用高度随内容浮动，卡片能给预览区一个稳定的正方形。

```css
.fc-mask { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.6); }
.fc-panel { width: 90%; max-width: 460px; background: #fff; border-radius: 16px; padding: 20px 16px 16px; }
```

`max-width: 460px` 是为了在平板上不撑成一张巨大的白卡。

**预览区底色是深色 `#0b0f17`，不是白色。** 用户上传的多半是浅色背景的人像，白底会让图片边界消失，用户不知道图到底铺到哪儿了。深色底让 `contain` 留白一眼可见。

**取景框外压四块半透明遮罩，而不是一个 `box-shadow` 挖洞。**

```html
<view class="fc-dim" :style="{ top:'0px', left:'0px', width: box+'px', height: dimTop+'px' }"></view>
<view class="fc-dim" :style="{ top: dimTop+'px', left:'0px', width: dimLeft+'px', height: cropW+'px' }"></view>
<view class="fc-dim" :style="{ top: dimTop+'px', left:(dimLeft+cropW)+'px', width:(box-dimLeft-cropW)+'px', height: cropW+'px' }"></view>
<view class="fc-dim" :style="{ top:(dimTop+cropW)+'px', left:'0px', width: box+'px', height: dimBottom+'px' }"></view>
```

上下左右四块，各自算宽高。小程序对 `box-shadow: 0 0 0 9999px` 这类写法的支持不稳，四块 `view` 是最保险的等价实现，代价是多三个节点和三个 computed（`dimTop` / `dimLeft` / `dimBottom`）。

**取景框里画一个虚线椭圆，横占 76%、竖占 88%。**

```css
.fc-oval { left: 12%; right: 12%; top: 6%; bottom: 6%; border: 1.5px dashed rgba(255,255,255,.75); border-radius: 50%; }
```

人脸是竖长的，椭圆比正方形更接近人脸的轮廓，能给出「额头到下巴应该占多高」的直觉。它 `pointer-events: none`，不挡拖动。

**只有右下角一个手柄，样式用边框画。** `.fc-handle--br::after` 是 `border-right: 3px solid #fff; border-bottom: 3px solid #fff`——一个 L 形折角，不用图片资源。手柄本身 26×26px，比视觉上的 12px 折角大一圈，是为了手指好按。

**按钮：取消是灰底，确定是品牌蓝。** `#f2f3f5` / `#0047bb`，和项目里其他主按钮一致。确定按钮在导出期间文案变成「裁剪中…」，并且 `onConfirm` 开头有 `if (this.exporting) return` ——**唯一一处防重复提交做得完整的地方**。

**整个弹层的字号比项目其他地方小一档。** 标题 17px、副标题 12px、按钮 15px，而这个项目别处的标题多是 16-18px 的 rpx。因为面板宽度只有 90% 屏宽，用 px 而不是 rpx 能让它在不同机型上保持相近的物理尺寸。

## 5. 代码怎么落地

**1）这是一个纯组件，不含任何接口调用。** 它不 import `api`、不 import `request`，只 emit 一个本地临时文件路径。上传由页面在拿到路径之后自己做（`visitUploadFaceApi(appointmentId, filePath)`）。所以它可以独立测：给一张图，看输出。

**2）常量的作用要连起来看。** 五个常量串成一条链：

```js
const OUTPUT_SIZE = 720;        // 导出边长
const MIN_SOURCE_PX = 240;      // 取景区域在原图中的最小真实边长
const MIN_PX = 24;              // 取景框最小 css 边长
const DEFAULT_CROP_RATIO = 0.72;// 默认框 = 短边 72%
const FACE_MIN_OUTPUT_PX = 200; // 与魔点一致的人脸下限
```

240 不是随便定的：720 输出里，如果取景区域只有 240 真实像素，放大 3 倍后人脸细节已经偏软；240 是「放大后还能用」的下限。720 则给人脸留了 3.6 倍余量（720/200）。

**3）如果要把这扇后门关上，最小的改动是让降级路径返回错误而不是原图。** 现在：

```js
if (!this.ready || !this._canvasReady) {
  return { filePath: this.src };
}
```

改成返回一个有明确语义的结果，让 `onConfirm` 能区分「裁剪成功」和「没裁成」：

```js
if (!this.ready || !this._canvasReady) {
  return { fallback: true, filePath: this.src };
}
```

`onConfirm` 侧就能决定：要么弹「当前环境无法裁剪，请换一张已裁好的方图」，要么在弹层里显示一次明确的降级提示，让用户知道上传的是原图。现在的写法把两种完全不同的结果压成了同一个 `{ filePath }`。

**4）几处确定的缺陷清单**（都能在源码里直接定位）：

- `exportCrop` 在 `!_canvasReady` 或非微信环境下返回 `{ filePath: this.src }`，`onConfirm` 当成裁剪成功，未裁剪的原图继续上传；下游 `checkFaceImageSize` 只校验整图宽高，拦不住「大图小脸」。
- `onConfirm` 在导出失败时先 emit `cancel` 关闭弹层，再 toast「裁剪失败，请重试」，用户无处重试，且整条录入流程被中止；而有 `blockedMsg` 的情况反而不关弹层。
- `computeLayout(0, 0)` 使 `ready` 永久为 `false`：预览空白、点确定只弹「图片加载中」，唯一出口是取消。
- EXIF 归一失败时回退到未交换的物理尺寸，重现注释里描述的那个坐标错位 bug。
- `wx.faceDetect` / `initFaceDetect` 不可用、或检测不到脸时一律放行，第 ⑤ 重保障在开发者工具中不生效。
- `_cropResolve` 没有任何 `onUnload` / `onHide` 兜底，页面退出时 Promise 不结算，`facePreparing` 卡在 `true`。
- `cropperSize` prop 从未被任何调用方传入，且 canvas CSS 尺寸写死 720，传非 720 值会导出越界区域。
- `submit.vue` 中 `processed.code === "TOO_SMALL"` 是死分支——`preprocessFaceImage` 从不返回 `code` 字段。
- `checkFaceImageSize` / `checkFaceFileSize` 在 `getImageInfo` / `getFileInfo` 失败时返回 `ok: true`，两道硬校验都有默认放行的门。
- `facePreprocess.js` 里同一段「魔点图片最大 2MB」的文档注释出现了两次（第 82-88 行与第 120-126 行重复）。
- 缩放只有右下角一个手柄，且用 `Math.max(dx, dy)` 投影位移：dx 为负、dy 为正的斜向手势会让框变大而不是变小。
- 一次裁剪最多经历三次有损编码：EXIF 归一 `q95` → 导出 `q92` →（若产物 > 1.5MB）预处理 `q70`。
- `console.info` 每次裁剪都打印 EXIF 归一结果与导出实测尺寸，包含完整路径片段。

这个组件值得单独写一篇，因为它展示了一件在小程序里很少见的事：**为了让一个只接受 200px 人脸的第三方接口正常工作，前端把所有能做的检查都做了一遍**——方向、布局、像素下限、导出实测、人脸检测。这些检查串成一条链，每一环都写得足够认真，注释里甚至记着具体机型和具体错误码。

但链子的一端没有拴住：只要 canvas 节点在 300ms 内没渲染出来，整条链就会被悄悄短路，退回成「直接传原图」，而所有下游检查都被设计成「读不到就放行」。**一套保障体系的可信度，等于它最弱那一环的可信度**，而这一环恰好是唯一一个会把失败伪装成成功的地方。
