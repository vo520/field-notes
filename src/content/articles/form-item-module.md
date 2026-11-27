---
title: 表单控件层：八个组件撑起一份资料表单，和它不成比例的耦合
description: 基于 components/form-item 八个组件与 pages/register 的真实源码，拆解插槽式表单行、$refs 直改子组件状态、角色回填的「其他」丢失、公司搜索失败无法重试、键盘高度串线等真实行为与缺陷。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 组件, 表单]
chapter: components
order: 3
level: deep
featured: false
draft: false
project: robot-forum-miniapp
---

前十一篇拆的都是页面。这一篇拆页面下面那层最不起眼的东西：`components/form-item/` 目录下的八个组件，一共 590 行，全部只被一个页面使用——`pages/register/index.vue`（个人信息）。

八个组件里没有一个有业务逻辑，它们只做三件事：显示一行标题、把控件塞进插槽、在下面留一条错误提示。真正值得注意的是它们和页面之间的通信方式：页面不传 props 给子组件，而是用 `$refs` 直接读写子组件的 `data`；子组件也不吐统一事件，而是各自 `$emit` 不同名字、不同形状的事件。这套做法能跑起来，但代价是十几个具体的缺陷。

## 1. 用户要完成什么

「我的」页点头像进「个人信息」，用户要填完一份资料：

- 选一个微信头像；
- 填姓名、邮箱；
- 搜索并选择公司（模糊查企信，搜不到可以手填）；
- 选公司地区（省市区三级）、填详细地址；
- 选应用领域（14 个行业的单选）；
- 选角色（可多选，每个角色前面自动加「我是」前缀）；
- 点「确定」保存。

一共七个表单行，全部在同一条竖列表单里。

## 2. 页面要怎么走

### 目录里到底有什么

| 文件 | 行数 | 作用 | 组件名 |
| --- | --- | --- | --- |
| `form-item/index.vue` | 33 | 表单行容器：标题 + 星号 + 插槽 + 错误提示 | `j-form-item` |
| `form-item/input.vue` | 57 | 文本输入框 + 清除按钮 | `JItemInput` |
| `form-item/input-nickname.vue` | 50 | 同上，但 `type="nickname"` | `JItemInputNickname` |
| `form-item/picker.vue` | 45 | 行业单选 picker | `JItemPicker` |
| `form-item/area.vue` | 39 | 省市区 picker | `JItemArea` |
| `form-item/role.vue` | 149 | 角色多选底部弹层 | `JItemRole` |
| `form-item/search.vue` | 216 | 公司搜索弹层 + 降级手填 | `JItemSearch` |
| `form-item/btn.vue` | 32 | 微信头像选择按钮 | `JItemBtn` |

页面逐个 import 并注册：

```js
import JFormItem from "@/components/form-item/index.vue";
import JItemBtn from "@/components/form-item/btn.vue";
import JItemInput from "@/components/form-item/input.vue";
import JItemInputNickname from "@/components/form-item/input-nickname.vue";
import JItemArea from "@/components/form-item/area.vue";
import JItemPicker from "@/components/form-item/picker.vue";
import JItemRole from "@/components/form-item/role.vue";
import JItemSearch from "@/components/form-item/search.vue";
```

### 表单行容器：标题、插槽、错误位

```html
<view class="form-item mb15">
  <view class="tp">
    <view class="lf c49 fs16">
      <text v-if="must" class="star">* </text>{{name}}
    </view>
    <view class="rt">
      <slot></slot>
    </view>
  </view>
  <view class="bottom fs14">
    <text v-show="showTip">{{placeholder}}</text>
  </view>
</view>
```

容器只有三个可见元素：左侧标题（`name`，`must` 为真时前面加星号）、右侧插槽、底部一条固定高度的错误位。

`showTip` 是容器自己的 `data`：

```js
props: ["name", "must", "type", "placeholder"],
data() { return { showTip: false } }
```

错误文案直接复用 `placeholder`——同一个输入框的占位符（「请输入邮箱」）就是它的错误提示（「请输入邮箱」）。所以错误位里不会出现比占位符更具体的信息。

`type` 在 `props` 里声明了，但模板里没有任何地方用它（唯一用到它的 textarea 分支是注释掉的）。页面给「公司」和「应用领域」传了 `type="btn"`，这两个值没有任何作用。

### 通信方式：页面用 $refs 直接改子组件的 data

页面不给这些控件绑 `v-model`，也不传 value。回填是这样做的：

```js
if (data.nickName) {
  this.formData.nickName = data.nickName
  this.$refs["nickName"].inputValue = data.nickName;
}
if (data.email) {
  this.formData.email = data.email
  this.$refs["email"].inputValue = data.email;
}
if (data.company) {
  this.formData.company = data.company
  this.$refs["search"].resultText = data.company;
}
if (data.companyAddress) {
  this.formData.companyAddress = data.companyAddress
  this.$refs["area"].preValue = data.companyAddress;
}
if (data.detailedAddress) {
  this.formData.detailedAddress = data.detailedAddress
  this.$refs["address"].inputValue = data.detailedAddress;
}
if (data.applicationArea) {
  this.formData.applicationArea = data.applicationArea
  this.$refs["field"].init(data.applicationArea)
}
if (res.data && res.data.roleGroup) {
  this.$refs["role"].init(res.data.roleGroup);
}
```

七行回填，七种不一样的手段：`inputValue`、`resultText`、`preValue`、`init(...)`。父组件越过子组件的 props 边界直接写子组件的内部状态，子组件也没有提供统一的 `setValue`。

反向方向靠 `$emit`，但事件名和载荷形状各不相同：

| 组件 | 事件 | 载荷 |
| --- | --- | --- |
| `input` / `input-nickname` | `change` | 字符串 |
| `input` / `input-nickname` | `getKeyboardHeight` | 数字（键盘高度 px） |
| `picker` | `change` | 行业名字符串 |
| `area` | `change` | 字符串数组（由 watcher 抛） |
| `area` | `onChange` | 字符串数组（由事件抛，无人监听） |
| `role` | `change` | roleId 数字数组 |
| `search` | `change` | 公司名字符串 |
| `btn` | `change` | 微信临时头像路径 |

页面把它们接到七个几乎一样的处理函数上：

```js
changeCompany(val) {
  this.formData.company = val;
  this.$refs['companyPld'].showTip = val == "";
}
```

注意 `showTip` 也是通过 `$refs` 写的——`companyPld` 指向 `j-form-item` 容器。校验状态同样绕过了 props。

### 校验：五个必填项，靠 `$refs` 点亮提示位

```js
if (this.formData.nickName == "") { this.$refs['namePld'].showTip = true; hasEmpty = true; }
if (this.formData.email == "") { this.$refs['emailPld'].showTip = true; hasEmpty = true; }
if (this.formData.company == "") { this.$refs['companyPld'].showTip = true; hasEmpty = true; }
if (this.formData.applicationArea == "") { this.$refs['fieldPld'].showTip = true; hasEmpty = true; }
if (this.formData.roleIds == "") { this.$refs['rolePld'].showTip = true; hasEmpty = true; }
if (hasEmpty) {
  uni.showToast({ title: "必填项不能为空哦～", icon: "none" })
}
```

`roleIds` 是数组，`[] == ""` 在 JavaScript 里成立，所以「一个角色都没选」能命中这个分支。邮箱没有任何格式校验，代码里没有正则。

公司地区和详细地址的校验被整段注释掉了，模板上这两行的 `must` 也没加，实际是可选的。

### 输入框：本地 v-model + watch 转发

```html
<input :type="type" v-model="inputValue" class="input fs16 c0" placeholder-class="phd" :placeholder="placeholder"
  @focus="onFocus" />
<image :src="closeIcon" mode="aspectFit" class="close-icon" v-show="inputValue" @tap="clearInput"></image>
```

```js
watch: {
  inputValue(val) { this.$emit("change", val) }
},
methods: {
  clearInput(){ this.inputValue = "" },
  onFocus(e) { this.$emit('getKeyboardHeight', e.detail.height) }
}
```

输入值存在子组件的 `data` 里，`v-model` 绑的是这个本地字段，再用 `watch` 把变化转成 `change` 事件。清除按钮靠 `v-show="inputValue"` 控制显隐，`inputValue` 是字符串，空串为假值，行为正确。

页面回填时写 `this.$refs["email"].inputValue = ...`，这个赋值同样会触发 `watch`，于是又 emit 一次 `change`，页面再次写 `formData.email`。值相同，不产生可见后果，但每次进页面都会多跑一轮回写。

`input-nickname.vue` 和 `input.vue` 是同一份代码的两份拷贝，差别只有一处：前者把 `type="nickname"` 写死在模板里，且不声明 `type` prop。

### 角色多选：名字前缀带来的回填漏洞

角色列表从接口拿，页面过滤掉 `status != "0"` 的项：

```js
const res = await roleListApi();
if (Array.isArray(res.data)) {
  let list = [];
  res.data.map(item => {
    if (item.status == "0") {
      list.push({ roleId: item.roleId, roleName: item.roleName, status: item.status })
    }
  })
  this.roleList = list;
}
```

`role.vue` 把它们渲染成底部弹层，每行左边是角色名，右边是选中态方块。角色名的「我是」前缀是在组件里加的：

```js
watch: {
  list: {
    deep: true,
    immediate: true,
    handler() {
      let res = [];
      if (Array.isArray(this.list)) {
        res = this.list.map(item => {
          let roleName = item.roleName;
          if (item.roleName != "其他") {
            roleName = "我是" + item.roleName
          }
          return { roleId: item.roleId, roleName, choose: false, status: item.status }
        })
      }
      this.roleList = res;
    }
  },
  roleList: { deep: true, handler(val) {} }
}
```

注意这个前缀是**排除「其他」**的：「我是采购经理」「我是设计师」，但「其他」保持原样。

选中状态存在组件内部的 `roleList` 里，通过 `emit()` 把选中的 roleId 数组抛出去：

```js
emit() {
  let arr = []
  this.roleList.map(item => { if (item.choose) { arr.push(item.roleId) } })
  this.$emit("change", arr)
}
```

回填走 `init()`：

```js
init(val) {
  const list = val.split(",").map(item => `我是${item}`)
  this.roleList.map(item => {
    if (list.indexOf(item.roleName) > -1) { item.choose = true; }
  })
  this.emit();
}
```

`init` 无条件给每一段加「我是」前缀，而 `roleList` 里「其他」是没有前缀的。两边对不上。

### 公司搜索：能降级，但不能重试

`search.vue` 弹出一个底部层，上面是灰底胶囊输入框和蓝色「搜索」按钮，下面是结果列表。点击结果后把公司名抛给页面。

请求走 `companyListApi`：

```js
export const companyListApi = (companyName) => {
  return get(`/biz/qiXin/company`, { companyName }, false)
}
```

搜不到、或接口报错时，都会降级成一条「直接使用「xxx」」的选项：

```js
try {
  const res = await companyListApi(this.inputValue)
  let list = [];
  const rows = (res && res.rows) || [];
  rows.map((item, index) => { if (index < 5) { list.push({ name: item, choose: false, isFallback: false }) } })
  if (!list.length) {
    list.push({ name: `直接使用「${this.inputValue}」`, choose: false, isFallback: true })
  }
  this.list = list
} catch (e) {
  console.warn("companyListApi|error", e && e.message)
  this.list = [{ name: `直接使用「${this.inputValue}」`, choose: false, isFallback: true }]
}
```

结果只取前 5 条。

### 头像：微信按钮 + 立即上传

`btn.vue` 用微信的 `open-type="chooseAvatar"`：

```html
<button type="default" class="btn c0" hover-class="hover" open-type="chooseAvatar" @chooseavatar="chooseAvatar">
  <image :src="avatarUrl" mode="aspectFill" v-if="avatarUrl" class="avatar-img"></image>
  <template v-else>
    <view :class="{'phd':avatarUrl==''}">请选择</view>
  </template>
</button>
```

选出来的 `e.detail.avatarUrl` 是微信临时文件路径，页面拿到后立刻上传：

```js
async changeAvatar(url) {
  const res = await uploadApi(url)
  this.formData.avatar = res.url;
}
```

`uploadApi` 最终走 `request.js` 的 `upload`，而 `upload` 固定 `toast: false`，失败不弹任何提示。

## 3. 空和失败怎么处理

**「其他」角色回填必定丢失。** `init()` 把后端返回的 `roleGroup` 按逗号切开，逐段加「我是」前缀后去匹配 `roleList` 里的 `roleName`。后端返回「其他」时，`init` 构造出的是「我是其他」，而 `roleList` 里存的是「其他」，`indexOf` 找不到，这一项永远不会被勾上。随后 `init` 调 `emit()`，抛出去的是「已勾选项的 roleId 数组」——「其他」的 roleId 因此不在里面。页面的 `formData.roleIds` 又是注释掉直接赋值、只靠 `init` 的 `emit` 回填的（`// this.formData.roleIds = data.roleIds`），所以这个 roleId 从头到尾没进过提交体。用户改个邮箱再保存，「其他」这个角色就没了。

**角色列表可能被拉两次，第二次会清空已勾选状态。** `onLoad` 里的 `initData()` 先 `await this.getRoleList()`，`onShow` 里又有一句 `if (this.roleList.length == 0) { this.getRoleList() }`。`onShow` 在 `onLoad` 之后立即触发，那时第一个请求还在路上，`roleList` 还是空数组，于是必然再发一次请求。两个响应都会写 `this.roleList`，而 `role.vue` 那个 `deep + immediate` 的 watcher 每次都会用 `choose: false` 重建整份 `roleList`——用户在此期间勾选的角色会被重置。

**角色多选可以全部取消。** `chooseRole` 是取反：

```js
chooseRole(index) { this.roleList[index].choose = !this.roleList[index].choose; this.emit(); }
```

取消最后一个时 `emit()` 抛空数组，页面 `changeRole` 把 `formData.roleIds` 置空数组，`[] == ""` 成立，点「确定」会被拦下并提示必填。行为上没错，但拦下的位置在提交那一刻，而不是在取消的那一刻。

**公司搜索失败后点「搜索」不会有反应。** `search()` 有一道去重：

```js
async search() {
  if (!this.inputValue) return;
  if (this.inputValue != this.inputValueCopy) {
    this.inputValueCopy = JSON.parse(JSON.stringify(this.inputValue));
    try { ... } catch (e) { ...降级... }
  }
}
```

`inputValueCopy` 在发请求**之前**就被写成了当前输入。所以第一次请求失败后，输入没变，再点「搜索」会被 `if` 挡掉，接口不会再发一次，列表停留在降级项上。用户只能改一个字再改回来才能触发重试。

**重新搜索后选中态会留在错误的行上。** `activeIndex` 记录选中的下标，`search()` 换了列表但没重置它，而模板是 `v-show="activeIndex==index"`。搜第二次后，原来第 1 行的勾会跑到新列表的第 1 行头上，哪怕两家公司毫无关系。

**弹层打开不会自动起键盘。** `toShowPop` 里设置焦点的代码整段被注释：

```js
toShowPop() {
  this.popVisible = true;
  // this.$nextTick(() => {
  // 	setTimeout(() => {
  // 		this.focus = true;
  // 	}, 1000)
  // })
}
```

`focus` 永远是 `false`，输入框上的 `:focus="focus"` 没有任何作用。用户每次都得手动点一下输入框。

**键盘高度串到了错误的组件上。** `getKeyboardHeight` 事件只有 `input` 和 `input-nickname` 会抛，页面这样接：

```js
getKeyboardHeight(h) {
  this.$refs["search"].keyboardH = h
}
```

在姓名、邮箱、详细地址里打字，都会把键盘高度写进**公司搜索弹层**的 `keyboardH`。这个值被搜索弹层用来撑开结果区的空白高度：

```js
emptyBoxStyle() { return { "height": `${this.keyboardH||0}px` } }
```

搜索弹层自己也有 `onFocus` 写 `this.keyboardH`，但只要用户在别的输入框打过字，这个值就已经被污染了。

**上传头像失败没有任何反馈。** `changeAvatar` 里 `await uploadApi(url)` 没有 try/catch，且 `upload` 固定 `toast: false`。请求失败时这个 await 抛出异常，方法静默中断，头像不更新，用户看不到任何提示——按钮上还显示着原来的「请选择」。

**头像地址没走 `fixImgUrl`。** 页面 import 了 `fixImgUrl`，但唯一一次使用是被注释掉的：

```js
// data.avatar = fixImgUrl(data.avatar)
if (data.avatar) {
  this.formData.avatar = data.avatar
  this.$refs["head"].avatarUrl = data.avatar || EmptyHeadImg;
}
```

后端返回相对路径时头像会裂图。同时 `data.avatar || EmptyHeadImg` 这段是死代码——它在 `if (data.avatar)` 里面，`data.avatar` 为空时根本进不来。

**地区 picker 打开时没有回显。** `area.vue` 用 `preValue` 承载回填值，`areaText` 优先显示已选数组，否则显示 `preValue`：

```js
areaText() {
  if (this.pickerValue.length > 0) { return this.pickerValue.join("/") }
  return this.preValue || ""
}
```

但 `<picker :value="pickerValue">` 绑的是那个空数组，所以文字显示的是「浙江省/杭州市/西湖区」，点开选择器却是空的。

**行业 picker 遇到列表外的值会显示占位符。** `picker.vue` 的 14 个行业是硬编码常量。`init(val)` 按名字找下标，找不到时 `index` 保持 `-1`，`text` 就退回「请选择应用领域」：

```js
computed: {
  text() { if (this.index > -1) { return this.array[this.index] } return "请选择应用领域" }
}
```

而后端存的值如果不在这份硬编码列表里（新增行业、改名），页面会显示成没选，但 `formData.applicationArea` 里存着后端的值。用户保存后还是提交那个值，界面和实际数据不一致。

**这个列表里还混着一个「置灰农业」。** 数组末尾的「置灰农业」和其余 13 项没有区别，一样可选，一样会被提交。

**两个可选行的错误位是空的。** 「公司地区」和「详细地址」传的是 `placeholder=""`，即使 `showTip` 被点亮，那一行也是空白。

## 4. 界面为什么要这样排版

表单行的排版规则集中在 `static/style/form-item.scss`，整份文件在 `App.vue` 里被全局 `@import`，不是 scoped：

```scss
.form-item {
  .tp {
    display: flex;
    .lf { width: 200rpx; padding: 10rpx 0; .star { color: #0047bb; } }
    .rt { width: 0; flex: 1; ... }
  }
  .bottom { color: #C70038; padding: 0 10rpx 0 220rpx; box-sizing: border-box; height: 48rpx; }
}
```

**标签列固定 200rpx，控件列自适应。** `.lf` 写死 200rpx，`.rt` 用 `width: 0; flex: 1`——这个项目里反复出现的写法：先把宽度声明为 0，再让它吃掉剩余空间。这样控件右边的内容再长也不会把标签挤变形。

**错误位高度固定 48rpx。** `.bottom` 的 `height` 是写死的，不是 `min-height`。错误提示出现时，表单不会整体往下跳一行，所有行的垂直节奏保持不变。代价是每行下方永远留着一块空白——七行表单里有五行下面都有一段空着的红字位。

**错误文案的左边界是 220rpx，不是 200rpx。** `.bottom` 的 `padding-left: 220rpx` 比标签列宽出 20rpx，正好等于控件区 `.btn` 的 `padding: 10rpx 20rpx` 的左内边距。错误文案和输入框里的文字左对齐，而不是和标签左对齐。

**必填星号是品牌蓝，不是红色。** `.form-item .lf .star` 的颜色是 `#0047bb`，和导航栏、按钮同一个蓝。但访客预约页 `pages/visit/submit.vue` 里同样的 `.star` 是 `#fa5151` 红色。两套表单对「必填」的视觉表达不一致。

**控件高度统一 68rpx。** `.rt .btn` 的 `min-height: 68rpx`、`.rt .input` 的 `height: 68rpx`、`.rt .textarea` 的 `min-height: 68rpx` 三者一致，所以输入框、picker、搜索弹层触发器、角色触发器在视觉上等高，切换视线时不会跳。

**占位符是灰色 `#979797`。** `.phd` 类配合 `placeholder-class="phd"`，输入框无值时显示灰字。有值的 `input` 组件是黑色 `c0`。

**搜索弹层的结果区用绝对定位加一个撑高占位块。** `.search-result` 里的 `.inner` 是 `position: absolute; top: 0; left: 0; height: 100%`，正常文档流里靠 `.empty-box`（`min-height: 450rpx`）占位。键盘弹起时把 `empty-box` 的高度改成键盘高度 px，结果列表就被顶到键盘上方。这套做法的代价是结果区固定至少 450rpx 高，键盘收起后那一大块空白还在。

**角色弹层每行 20rpx 上下内边距，选中态是 36rpx 的方块。** `.rb-rt` 是 36×36rpx 的描边方框，`.active` 时底色换成 `#0047bb`，里面放一张白色对勾图。未选中时方框是空的——没有打勾图标，只有一个空框。

**弹层内容四周留白 100rpx 60rpx。** `.role-box` 和 `.search-box` 用同一组内边距，两个弹层的视觉重量一致。

## 5. 代码怎么落地

**1）这层是插槽式的，不是 props 式的。** 容器只负责三块：标签、插槽、错误位。控件完全由页面决定塞什么进去，所以换一行控件不用改容器，加一行控件也不用改容器。代价是错误位高度、左右分栏这些视觉规则全靠全局 scss 的类名约定维持，容器里的 `<style scoped>` 是空的。

**2）父改子状态用 `$refs`，子改父状态用 `$emit`，两边都没有契约。** 七行回填用了四种写法，三种事件名，`showTip` 也是 `$refs` 直写。这套方式在 Vue2 里能工作，但组件失去了封装：`input.vue` 内部把值叫 `inputValue`、`search.vue` 叫 `resultText`、`area.vue` 叫 `preValue`、角色组件的回填叫 `init()`——名字由子组件单方面决定，页面必须知道每个子组件的内部约定才能写回填代码。

**3）如果要把这层重构，方向是给每个控件统一一个 `value` prop 和一个 `change` 事件。** 现在的七种回填方式可以收敛成一种：

```js
// 子组件统一约定
props: { value: { default: "" } },
watch: { value(val) { this.inputValue = val } }
```

页面侧就变成 `v-model="formData.email"`，`showTip` 改成 `:error="formData.email === ''"` 之类的显式 props，不再需要 `$refs` 写内部状态。

**4）几处确定的缺陷清单**（都能在源码里直接定位）：

- `role.vue` 的 `init()` 无条件加「我是」前缀，而 `roleList` 里「其他」没有前缀，后端返回「其他」时这个角色回填丢失，保存后被抹掉。
- `role.vue` 里 `watch.roleList` 的 handler 是空的 `handler(val) {}`，纯占位代码。
- `role.vue` 每次 `list` 变化都用 `choose: false` 重建列表；页面 `onShow` 会在 `onLoad` 的请求还没回来时再拉一次角色列表，第二次响应会清掉用户已勾选的角色。
- `role.vue` 允许取消最后一个角色，空数组提交时才在「确定」处被拦，提示时机偏晚。
- `search.vue` 的 `inputValueCopy` 在发请求前写入，接口失败后无法通过再次点击「搜索」重试。
- `search.vue` 重新搜索时不重置 `activeIndex`，选中勾会落到新列表的同一下标行上。
- `search.vue` 的自动聚焦代码整段被注释，`focus` 永远是 `false`。
- `search.vue` 每次 `search()` 打印 `console.log("picker change"...)` 同类的调试日志（`picker.vue` 里也有 `console.log("picker change", ...)`）。
- 页面 `getKeyboardHeight` 把姓名/邮箱/地址输入框的键盘高度写进公司搜索弹层，两处状态串线。
- 页面 `changeAvatar` 对 `uploadApi` 没有 try/catch，且 `upload` 固定 `toast: false`，头像上传失败无任何提示。
- 页面 import 了 `fixImgUrl` 但唯一一次调用被注释，头像地址可能因相对路径裂图；`data.avatar || EmptyHeadImg` 是 `if (data.avatar)` 内部的死代码。
- `picker.vue` 的 14 个行业是硬编码常量，后端出现列表外的值时显示成占位符；数组末尾混着一条「置灰农业」。
- `area.vue` 的回填只写 `preValue`，`<picker :value>` 绑的是空数组，打开选择器不回显。
- `form-item/index.vue` 的 `type` prop 声明了但从未使用；页面传的 `type="btn"` 无效。
- 「公司地区」「详细地址」两行 `placeholder=""`，错误位即使点亮也是空白。
- 必填星号在表单层是 `#0047bb` 蓝、在访客预约页是 `#fa5151` 红，两套表单标准不一致。
- `input.vue` 与 `input-nickname.vue` 是整份拷贝，只差 `type="nickname"` 一个属性。

这层组件真正的教训不在某一行的 bug，而在**它们没有统一的接口**。八个组件、七个消费场景、四种回填方式、三种事件名，任何一个页面想加一个新控件，都要先猜一遍这个目录的既有约定，再照着抄一份；`role.vue` 那 149 行就是这种「抄一遍再改」攒出来的。
