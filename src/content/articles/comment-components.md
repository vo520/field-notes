---
title: 评论区四件套：拍平三层回复、两种「回复给谁」，和一个在 iOS 上会变成 NaN 的时间
description: 基于 comment-item / comment-list / comment-tools / no-comment 四个组件与帖子详情页的真实源码，拆解评论区的拍平策略、isOut 的反向语义、只有 12px 的回复入口、发送失败后消失的输入内容，以及一处项目自己在别的页面注释过、这里却没修的日期解析。
publishedAt: 2026-11-26
tags: [uni-app, 小程序, 评论组件, 代码质量]
chapter: components
order: 6
level: deep
featured: false
draft: false
project: robot-forum-miniapp
---

上一篇拆的是 `pages/news/detail.vue`，一个没有互动的只读页。这一篇拆有互动的那个：挂在帖子详情底部的评论区。

四个组件，431 行：

| 组件 | 行数 | 职责 |
| --- | --- | --- |
| `components/comment-item` | 142 | 一条评论：头像、昵称、内容、时间、回复按钮 |
| `components/comment-list` | 46 | 两层循环：主评论 + 它的子评论 |
| `components/comment-tools` | 195 | 底部固定输入栏，聚焦时把社交按钮换成发送 |
| `components/no-comment` | 48 | 空态：「还没有评论哦」+「抢首评」 |

再加两段胶水：`pages/post/index.vue:175-214` 的拉取与提交，和 `tools/util.js:220-238` 一个 19 行的拍平函数。

评论区的复杂度不在 UI，在数据结构：后端返回的是树，界面渲染的是两层，中间那层转换决定了「谁回复了谁」到底怎么显示。

## 1. 用户要完成什么

| 用户动作 | 走到的组件 | 用户看到 |
| --- | --- | --- |
| 进帖子看评论 | `comment-list` → `comment-item` | 头像 + 昵称 + 内容 + 时间（+ 回复） |
| 帖子还没有评论 | `no-comment` | 灰字「还没有评论哦」+ 灰底胶囊「抢首评」 |
| 点「抢首评」 | `comment-tools.startComment()` | 底部输入框聚焦，键盘弹起 |
| 点某条评论的「回复」 | `comment-item` emit → 页面转给 `comment-tools.toReply` | placeholder 变成「回复@某某」 |
| 发一条评论 | `comment-tools.toComment` → 页面 `confirmComment` | 全屏 loading，成功后 input 清空、列表重拉 |
| 点赞 / 收藏 / 分享 | `comment-tools` 右侧的 `social-box` | 三个图标，行为与帖子详情一致 |

评论区本身不支持点赞。`comment-item` 里原来有一列点赞图标，现在整块注释掉了（`comment-item/index.vue:16-19`）。

也不支持分页：`commentListApi(postId)` 不带任何分页参数（`api/index.js:88-90`），一次拿全量。

## 2. 页面要怎么走

### 2.1 三块拼装，空态用 v-show 压在下面

```html
<!-- pages/post/index.vue:27-30 -->
<JNoComment v-show="commentList.length==0" @startComment="startComment" />
<JCommentList :list="commentList" @toReply="toReply" />
<JCommentTools :info="postDetail" @comment="confirmComment" @changeCollect="changeCollect"
    @changeLike="changeLike" @share="share" ref="commentTools" :token="token" />
```

`v-show` 而不是 `v-if`：空态节点一直在 DOM 里，只切 `display`。这样列表从 0 条变 1 条时不会有节点创建开销，代价是**首屏必然会先露出一次空态**——`commentList` 初始是 `[]`（`post/index.vue:80`），请求回来之前 `length==0` 一直成立。

### 2.2 拉取：两种返回形状都接

```js
// pages/post/index.vue:175-190
async getCommentList() {
    try {
        const res = await commentListApi(this.postId);
        console.log('commentListApi', res)
        const list = res.rows || res.data || [];
        list.forEach(item => {
            if (item.childComments) {
                item.childComments = innerListToOut(item.childComments, "childComments")
            }
        })
        console.log("list", list)
        this.commentList = list;
    } catch (e) {
        console.warn("[post.getCommentList] fail", e && e.message)
    }
}
```

`res.rows || res.data || []` 是在兼容分页结构和单体结构两种后端返回——这个项目里两种都存在（论坛列表用 `rows`，详情用 `data`）。评论接口返回哪种没有在代码里写死，靠运行时兜。

### 2.3 拍平：树进来，两层出去

`innerListToOut` 是这个模块的核心：

```js
// tools/util.js:220-238
export const innerListToOut = (list, key, out) => {
	let res = [];
	list.map(item => {
		item.isOut = out === false ? false : true;
		res.push(item)
		if (item[key]) {
			item[key].map(inner => {
				res.push(inner)
				if (inner[key]) {
					let arr = innerListToOut(inner[key], key, false)
					arr.map(a => {
						res.push(a)
					})
				}
			})
		}
	})
	return res;
}
```

它的输入是某个主评论的 `childComments`，输出是一个**扁平的**数组：直接子评论 + 所有更深层的后代，全部排在同一层。

形状变化：

```
后端：A
        ├─ B
        │    └─ C
        │         └─ D
        └─ E

拍平后 childComments = [B, E, C, D]
```

渲染时 `comment-list` 只做两层循环：外层 `list`（主评论），内层 `item.childComments`（拍平后的回复）。组件里没有任何递归。

这一步有三个副作用：

1. **原地修改**。`item.isOut = ...` 直接写在传进来的对象上，函数不是纯的。同一条数据被处理两次，`isOut` 会被重新赋值，`res` 里也会出现重复项。
2. **层级信息只剩 `isOut` 和 `parentNickName`**。C 和 D 在数组里是 B 的邻居，视觉缩进和 B 完全一样（都是 100rpx），只能靠文案区分谁回复了谁。
3. **顺序由遍历顺序决定**。`[B, E, C, D]`：先所有直接子评论，再把每个子评论的后代依次塞进来。所以 C 出现在 E 后面——如果后端按时间排序，拍平后时间线就断了。

### 2.4 isOut：一层不显示「回复给谁」，三层反而显示

`comment-item` 的昵称是这么拼的：

```js
// components/comment-item/index.vue:50-55
nickName() {
    if (this.info.parentNickName && !this.info.isOut) {
        return `${this.info.nickName}▶${this.info.parentNickName}`
    }
    return `${this.info.nickName}`
}
```

`isOut` 为 true 时不拼 `▶`。而 `innerListToOut` 给直接子评论标的是 `true`、给更深的标的是 `false`（递归时传了 `out = false`）。

所以实际效果是：

| 评论层级 | isOut | 显示 |
| --- | --- | --- |
| 主评论 | 无 | 昵称 |
| 直接回复主评论 | `true` | 昵称（不带「回复给谁」） |
| 回复的回复及更深 | `false` | `昵称▶被回复人昵称` |

从阅读上这是说得通的：直接子评论就挂在父评论下面，不需要再写一遍「回复 A」；被拍平到同一层的深层回复丢了位置，必须用 `▶` 补上下文。

但从代码上，`isOut` 这个名字读不出这层意思——它更像「是不是外部来源」，实际控制的是「要不要显示被回复人」。要改这个显示规则，得同时改 `util.js` 里那个 `out === false ? false : true` 的三元表达式，两处相隔一个文件、一个页面。

### 2.5 渲染：两层循环 + 100rpx 缩进

```html
<!-- components/comment-list/index.vue:3-12 -->
<view class="item mb20" v-for="(item,index) in list" :key="index">
    <view class="mb20">
        <JCommentItem :info="item" @toReply="toReply" />
    </view>
    <template v-if="item.childComments">
        <view class="inner-item mb10" v-for="(child,cIndex) in item.childComments" :key="`c${cIndex}`">
            <JCommentItem size="small" :info="child" @toReply="toReply" />
        </view>
    </template>
</view>
```

缩进 100rpx（`comment-list/index.vue:41-44`），子评论头像缩到 56rpx（`comment-item/index.vue:111-114`）。100 ≈ 父级头像 80 + 右间距 20，所以子评论的头像正好对齐父评论文字的左边缘。

`size` 是字符串 prop，模板里用 `size=='small'` 松散比较（`comment-item/index.vue:4`）。small 只改宽高，`border-radius` 还是 40rpx——56rpx 的头像配 40rpx 圆角，已经大于半径，视觉上仍是圆形，所以看不出问题，但这说明尺寸没有成套抽出来。

### 2.6 输入栏：聚焦时右侧让位

普通状态下，底部是「输入框 + 三个社交图标」：

```html
<!-- components/comment-tools/index.vue:3-17 -->
<view class="lf">
    <image :src="editIcon" mode="" class="edit-icon"></image>
    <textarea v-model="inputValue" :placeholder="placeholderValue" placeholder-class="phd"
        class="ipt comment-text" @focus="onFocus" @blur="onBlur" auto-height hold-keyboard :cursor-spacing="15"
        :focus="focus" />
</view>
<view class="rt">
    <JSocialBox size="small" v-show="!showSend" :info="info" :token="token" @changeCollect="changeCollect"
        @changeLike="changeLike" @share="share" />
    <view v-show="showSend" @tap.stop="toComment" class="icon-box fc">
        <image :src="sendIcon" mode="" class="icon"></image>
    </view>
</view>
```

聚焦（`showSend = true`）时，右侧三个图标隐藏、换成发送按钮，同时 `.lf` 从 `flex: 1` 变成 `flex: 9`（`comment-tools/index.vue:185-195`），`.rt` 保持 `flex: 1`。也就是输入区占 90%、发送键占 10%。

整个工具栏是 `position: fixed; bottom: 0; z-index: 999`（`comment-tools/index.vue:121-130`），帖子页底部留了一个 `.safe-area` 占位（`post/index.vue:31`），避免最后一条评论被工具栏盖住。

### 2.7 回复：只改 placeholder，不改输入框

```js
// components/comment-tools/index.vue:71-76
toReply(val) {
    this.replyInfo = val;
    console.log("toReply", val)
    this.placeholderValue = `回复@${val.nickName}`
    this.focus = true;
},
```

回复对象存在 `replyInfo` 里，界面上唯一的提示是 placeholder 文字。输入框不会预填「回复@某某：」，也不会在发送前再确认一次回复对象。

发送时两个参数一起 emit：

```js
// components/comment-tools/index.vue:80-103
toComment() {
    console.log("toComment", this.inputValue)
    if (this.inputValue == "") {
        this.$refs.uToastRef.show({
            type: 'default',
            message: "评论内容不能为空",
            position: "bottom"
        })
    } else {
        uni.hideKeyboard()
        this.$emit("comment", this.inputValue, this.replyInfo)
        this.inputValue = "";
    }
},
```

页面拿到 `(val, parentObj)` 后组装请求：

```js
// pages/post/index.vue:191-214
async confirmComment(val, parentObj) {
    uni.showLoading({
        title: ""
    })
    let data = {
        postId: this.postId * 1,
        content: val,
    }
    if (parentObj) {
        data.parentCommentId = parentObj.commentId * 1
    }
    try {
        await addCommentApi(data)
        await this.getPostDetail();
        await this.getCommentList();
        uni.showToast({ title: "评论成功" })
    } catch (e) {
        console.warn("[post.confirmComment] fail", e && e.message)
    } finally {
        uni.hideLoading();
    }
}
```

一次提交后面跟两个串行 GET：先重拉详情（为了更新评论数并写 store），再重拉列表。加上 POST 本身，一共三个往返，全部结束后才弹「评论成功」。

## 3. 空和失败怎么处理

### 3.1 空态和失败态长得一样

`v-show="commentList.length==0"` 只看长度，不看请求状态。于是三种情况都显示「还没有评论哦 / 抢首评」：

| 情况 | 用户看到 |
| --- | --- |
| 请求还没回来 | 空态（通常一两百毫秒，网络差时更久） |
| 请求失败了 | 空态（请求层的 toast 一闪而过） |
| 确实没有评论 | 空态（正确） |

第一次进帖时这个问题最明显：页面先画空态，再画列表，中间有一次跳动。而如果列表接口失败，用户会以为这个帖子没人评论，点「抢首评」写一条——其实原来的评论只是没拉到。

### 3.2 失败只写日志

`getCommentList` 的 `catch` 只有 `console.warn`（`post/index.vue:187-189`），`commentList` 保持原值。首次进入就是空数组，于是落在上面说的空态；已经看过一轮再失败的，列表停在旧数据上，用户不知道看到的是缓存。

### 3.3 发送失败，输入的内容已经没了

`comment-tools` 在 emit 之后**立刻**清空 `inputValue`（`comment-tools/index.vue:99-100`），不等后端结果：

```js
this.$emit("comment", this.inputValue, this.replyInfo)
this.inputValue = "";
```

页面的 `confirmComment` 失败时只 `console.warn`，不会把内容回填。用户打完一段话、点发送、网络断了，输入框是空的，得重打。

请求层默认 `toast = true`（`tools/request.js:74`），所以失败时用户至少会看到后端返回的 message 或「请求失败」（`request.js:47-51`）——但看到提示和找回内容不是一回事。

### 3.4 回复状态靠 blur 隐式复位

`toReply` 设了 `replyInfo`，但没有任何地方在「发送成功」后显式清它。复位发生在 `onBlur`：

```js
// components/comment-tools/index.vue:104-110
onBlur() {
    this.showSend = false;
    this.focus = false;
    if (this.inputValue == "") {
        this.clearReply()
    }
},
```

`toComment` 先 `uni.hideKeyboard()`，再 emit、再清空 `inputValue`。正常情况下键盘收起触发 blur，此时 `inputValue` 已经是空串，于是 `clearReply()` 把 `replyInfo` 和 placeholder 都还原。

这条链路依赖三个时序假设：`hideKeyboard` 一定触发 blur、blur 一定发生在 `inputValue = ""` 之后、输入框一定为空。任何一个不成立（比如某些端主动收起键盘不派发 blur），下一条评论会带上上一条的 `parentCommentId`，凭空变成「回复某某」，而 placeholder 也还停在「回复@某某」。

### 3.5 时间：直接 `new Date(字符串)`

```js
// components/comment-item/index.vue:64-73
getCommentTime(time) {
    if (time) {
        const commentTime = new Date(time)
        let year = commentTime.getFullYear();
        let month = (commentTime.getMonth() + 1).toString().padStart(2, '0');
        ...
        let formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
```

如果 `createTime` 是 `2026-11-26 10:00:00` 这种带空格的格式，iOS 上 `new Date()` 会得到 Invalid Date，`getFullYear()` 返回 `NaN`，三个分支全部不成立，最后落到 `return \`${year}-${month}-${day}\``，显示 **`NaN-NaN-NaN`**。

这个坑项目里已经踩过、也写下来了：

```js
// pages/visit/record.vue:594-600
// ⚠️ iOS 下 new Date("yyyy-MM-dd HH:mm:ss") 得到 Invalid Date(NaN)，
// 必须先把 "-" 换成 "/" 再解析；纯数字（本地 createdAt / 时间戳）直接返回。
// 旧实现直接 new Date(a.createTime || a.createdAt || 0)，iOS 上会得到 NaN → 排序失效。
tsOf(item) {
```

访客记录页为此写了一个 20 行的 `tsOf`，评论组件没接。`tools/util.js` 里的 `simpleDate`（`util.js:298-333`）同样直接 `new Date(dateStr)`，所以换成 `simpleDate` 也修不了——真要修，得先修工具层，或者统一后端时间格式。

顺带一提，`getCommentTime` 里 `formattedDate`、`formattedDate_c`、`hours_c`、`minutes_c`、`seconds_c` 五个变量算完都没用；第 82 行还把评论时间的变量赋给了 `_c`：

```js
// components/comment-item/index.vue:82
let formattedDate_c = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
```

`formattedDate_c` 应该是当前时间的格式化结果，实际拿到的是评论时间。因为没人用它，这个复制粘贴错误一直没有暴露。

### 3.6 空字段

| 字段 | 缺失时 | 结果 |
| --- | --- | --- |
| `nickName` | `\`${undefined}\`` | 昵称位置显示字符串 `undefined` |
| `userAvatar` | `fixImgUrl` 走 else 分支 | 回退到默认头像（`util.js:29-31`） |
| `parentNickName` | 不拼 `▶` | 只显示自己的昵称 |
| `createTime` | 函数无返回值 | 时间位置空白，「回复」按钮仍在 |
| `content` | 空字符串 | 只剩昵称、时间和「回复」 |

`nickName` 这条和项目里另一处不一致：`interact-item` 的同类逻辑在缺字段时返回「匿名用户」（`components/interact-item/index.vue:51-56`），评论项返回 `undefined` 字面量。同一个字段、两套兜底。

## 4. 界面为什么要这样排版

### 4.1 一条评论占两行

第一行只有昵称，第二行是内容 + 时间 + 「回复」：

```
[头像]  张三
        这个活动还有名额吗？  11-26  回复
```

时间和「回复」跟内容排在同一行尾部，而不是各自占一行。评论列表通常很长，每省一行就多显示 2~3 条；代价是内容很长时，时间和按钮会被挤到下一行（`text` 是 inline，会自动折行），看起来像「时间挂在内容末尾」。

时间 12px、颜色 `#979797`（`comment-item/index.vue:12`、`121-124`），和昵称同色；内容 `#494949`，比两者都深。信息层级是「内容 > 谁说的 > 什么时候」，这和论坛信息流相反——信息流里标题最重、作者次要。

### 4.2 为什么拍平，而不是递归组件

递归渲染最直观：`comment-item` 里再放一个 `comment-list`，有几层画几层。但那样节点层级跟着回复深度走，一条被反复回复的老评论能让单个列表项深五六层，长列表滚动时每帧要处理的节点数不可控（小程序端尤其明显）。

拍平的代价是丢失层级，只留 100rpx 缩进 + `▶` 文案两个线索。所以拍平不是「省事」，是拿表达能力换渲染成本。

### 4.3 底部工具栏为什么要换布局

普通状态需要三个社交按钮（点赞、收藏、分享），聚焦状态需要发送按钮——两者互斥，所以在同一个 `.rt` 里用 `v-show` 切换。

聚焦时输入区从 `flex: 1` 变成 `flex: 9`，是因为键盘弹起后可视高度只剩一半左右，输入框太窄会看不到自己打的字；发送键只需要放一个 40rpx 的图标。

`hold-keyboard` 让点击键盘外部时键盘不收起（配合 `@tap.stop` 防止事件冒泡关闭键盘），`cursor-spacing="15"` 让光标离键盘顶留 15px。这两个属性都是为了让「点发送」这一步不打断输入。

### 4.4 空态为什么这么淡

`padding: 56rpx 0`、灰字 24rpx、按钮是 `#F6F6F6` 底 + `#494949` 字（`no-comment/index.vue:19-47`）。没有插画、没有品牌色。

因为这个空态出现频率高（每个新帖都有），而且它下面就是输入栏——视觉上再强一点，用户会以为「抢首评」是页面主操作。现在它更像一句提示，真正的操作入口还是底部输入框。

（顺带一句：`.btn` 里写了 `&:hover` 改背景色（`no-comment/index.vue:44-46`），小程序没有鼠标悬停，要按下反馈得配 `hover-class`。这段样式不会生效。）

## 5. 代码怎么落地

### 5.1 结构

```
pages/post/index.vue
  ├─ onLoad            → getPostDetail() + getCommentList()
  ├─ onShow            → 只重拉详情（不重拉评论）
  ├─ getCommentList()  → commentListApi(postId)
  │                       └─ childComments = innerListToOut(childComments, 'childComments')
  ├─ confirmComment()  → addCommentApi → getPostDetail → getCommentList → toast
  ├─ JNoComment        v-show="commentList.length == 0"  @startComment
  ├─ JCommentList      :list="commentList"               @toReply
  │    └─ JCommentItem × N（主评论）+ × N（childComments，size="small"）
  └─ JCommentTools     ref="commentTools"                @comment / @changeLike / @changeCollect / @share
       └─ JSocialBox   v-show="!showSend"
```

### 5.2 读这一块按这个顺序

1. **先看数据形状**。`commentList` 是「主评论数组 + 每个主评论的 childComments 已拍平」，不是原始树。调试时看到 `childComments` 里有本应是孙子的项，不是 bug。
2. **改「回复给谁」的显示规则要动两处**：`comment-item` 的 `nickName` 判断 `!isOut`，`util.js` 的 `innerListToOut` 决定谁能拿到 `isOut = false`。
3. **改标题/内容样式只改 `comment-item`**，`comment-list` 只管缩进和间距。
4. **输入栏的回复对象不在这里提交**，它只是把 `replyInfo` 透传给页面；校验 `parentCommentId` 要去 `post/index.vue:191-201`。
5. **空态出现得早是设计使然**（`v-show` + 初始空数组），要消除闪烁得给 `getCommentList` 加一个独立的 loading 标志，不能只改模板。
6. **时间格式不要在这里改**。评论组件、`interact-item`、访客记录页各有一套，真正的统一入口应该是 `tools/util.js`。

### 5.3 记录的真实问题

| # | 问题 | 位置 |
| --- | --- | --- |
| 1 | 空态用 `v-show` 且不看加载状态：每次进帖先闪一次「抢首评」，网络慢时更久 | `pages/post/index.vue:27,80,94` |
| 2 | 拉取失败与「确实没评论」都落在同一个空态，用户会以为没人评论 | `pages/post/index.vue:175-190` |
| 3 | 发送失败时输入内容已清空、不回填，用户需重打 | `components/comment-tools/index.vue:99-100` |
| 4 | `replyInfo` 没有显式复位，只靠 `hideKeyboard → blur → inputValue==""` 这条时序链；任一端不派发 blur 就会把下一条评论挂到上一个 `parentCommentId` | `components/comment-tools/index.vue:71-76,94-110` |
| 5 | `new Date(createTime)` 直接解析带空格的日期字符串，iOS 得到 Invalid Date，显示 `NaN-NaN-NaN`；项目在 `record.vue` 已注释记录此坑并做了兼容，这里没做 | `components/comment-item/index.vue:66`、`pages/visit/record.vue:594-600` |
| 6 | `getCommentTime` 里 5 个变量算完不用；第 82 行把评论时间赋给了当前时间的变量 | `components/comment-item/index.vue:73,79-82` |
| 7 | `nickName` 缺字段时返回字符串 `undefined`，而 `interact-item` 同类逻辑返回「匿名用户」 | `components/comment-item/index.vue:50-55`、`components/interact-item/index.vue:51-56` |
| 8 | 拍平函数原地修改入参（`item.isOut`），对同一份数据调用两次会产生重复项 | `tools/util.js:220-238` |
| 9 | 拍平后顺序是「所有直接子评论 + 各子评论的后代」，时间线被打断；层级只靠 `▶` 表达 | `tools/util.js:226-233`、`components/comment-item/index.vue:51` |
| 10 | `isOut` 命名与语义相反：直接子评论为 `true`（不显示被回复人），更深层为 `false`（显示） | `tools/util.js:223,229` |
| 11 | 点赞整块注释，但 `TestHeadImg`、`IconLike`、`IconLikeActive` 三个 import 与三个 data 字段仍保留 | `components/comment-item/index.vue:16-19,24-26,42-47` |
| 12 | `headUrl()` 是方法不是 computed，每次重渲染都调一次 `fixImgUrl` | `components/comment-item/index.vue:4,61-63` |
| 13 | 回复入口只有 12px 的「回复」文字，整条评论不可点，触控目标远小于 44px | `components/comment-item/index.vue:13` |
| 14 | 只挡 `inputValue == ""`，纯空格可以提交 | `components/comment-tools/index.vue:83` |
| 15 | `uni.showLoading({ title: "" })` 空标题遮罩；成功后串行再发两个 GET，三个往返结束才提示成功 | `pages/post/index.vue:192-208` |
| 16 | 评论接口不分页、不带排序参数，一次全量返回 | `api/index.js:88-90` |
| 17 | `onShow` 只重拉详情不重拉评论：从别的页面返回时评论数变了、列表没变 | `pages/post/index.vue:96-99` |
| 18 | `no-comment` 里写了 `&:hover`，小程序不支持，按下无反馈 | `components/no-comment/index.vue:44-46` |
| 19 | 两处 `console.log` 留在生产代码里，每次进帖打印完整评论列表 | `pages/post/index.vue:178,185` |

### 5.4 验证

- `npm test`：10 个测试文件、144 项全部通过。
- `npm run check`：95 个文件，0 error / 0 warning / 0 hint。
- `npm run build`：Pagefind 索引 91 页，构建无报错。
- `npm run test:build`：构建冒烟 22 项通过。
- 产物：`dist/articles/comment-components/index.html`、`dist/og/articles/comment-components.png`。

这个模块的代码量不大，问题集中在三处：空态和失败态共用一套 UI、回复状态靠隐式时序复位、以及时间解析抄了一份带 bug 的旧实现。前两个是「用户能感觉到但说不出哪里不对」的类型，第三个会在 iOS 上直接显示 `NaN-NaN-NaN`。
