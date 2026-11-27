---
title: 一个每日自动签到系统的工程笔记：登录态、设备锁与幂等
description: 从客户端登录态解密、多账号设备锁、失败重试到 launchd 与 Docker 双形态部署，记录一个长期运行的个人自动化项目里真正需要想清楚的事。
publishedAt: 2026-11-25
tags: [工程实践, Python, 自动化, Docker]
chapter: notes
cover: /images/chapters/notes.svg
order: 4
level: practice
featured: false
draft: false
---

这个项目最初只是一个几十行的脚本：读登录态、调签到接口、打印结果。跑了几个月之后，它变成了带多账号管理、HTML 报告、本地 API、launchd 定时和 Docker 常驻的完整工具。功能变多不是重点，真正花时间的是几个判断：**登录态该以什么形态保存、多账号在同一台设备上如何互不干扰、什么才算「签到成功」、失败之后该重试还是该放弃**。

这篇按这几个问题记录实现方式和踩过的坑，代码来自 `daily_signin.py` 与配套的 `signin` 命令。

## 登录态：保存「能带走的形态」，而不是明文 token

Trae CN 是 Electron 客户端，登录态存在 `storage.json` 里，字段 `iCubeAuthInfo://icube.cloudide` 的值是 base64 字符串。解出来之后是「头部 + 密钥 + 密文」的固定结构：

```python
def decrypt_auth(b64_text: str) -> dict:
    t = base64.b64decode(b64_text)
    key = t[HDR_LEN:HDR_LEN + KEY_LEN]          # 6..38
    sha = hashlib.sha512(key).digest()
    xor = bytes(a ^ b for a, b in zip(URE, DRE))
    h = hashlib.sha512(sha + xor).digest()
    aes_key, iv = h[:16], h[16:32]
    ct = t[HDR_LEN + KEY_LEN:]
    plain = unpad(AES.new(aes_key, AES.MODE_CBC, iv).decrypt(ct), AES.block_size)
    return json.loads(plain[HMAC_LEN:].decode("utf-8"))
```

这里有一个影响架构的决定：**持久化保存的是加密串 `enc`，不是解密后的 token**。

原因是项目有两套运行环境——本机 macOS 定时跑，和 Linux 容器常驻跑。客户端只能在 macOS 上登录，但签到接口在容器里也能调。如果保存明文 token，等于把凭据复制了一份到磁盘；而保存 `enc`，容器里用同一套算法解密即可。捕获账号时写入的配置长这样：

```json
[{ "label": "nice", "enc": "....", "captured_at": "2026-10-13 11:00:00" }]
```

这条经验可以推广：**凭据的存储形态，决定了部署的边界**。先想清楚「这份凭据要跟着代码走到哪里」，再决定落盘什么。

配套的两个细节：

- 解密后按 `token` 去重。同一个人在客户端反复登录会生成新的 `enc`，但 token 不变，不该重复统计。
- `capture` 是追加而不是覆盖。多账号靠客户端逐个切换登录、逐个捕获，脚本本身无法替你完成登录。

## 设备锁：多账号为什么需要伪造 device_id

Trae CN 的签到是设备维度的：同一台设备上，一个账号领过之后，其他账号再领会返回 `9095`。这带来两个必须处理的现实：

第一，**状态判定不能看错字段**。接口同时返回 `checked_in` 和 `did_checked_in`，后者只表示「这台设备今天有账号签过」，不代表当前账号签过。只认 `checked_in`，否则第二个账号会被误判为已完成，积分统计直接失真。

第二，**额外账号需要独立的 device_id**。原生账号从客户端配置里读真实的 device_id；额外捕获的账号没有对应目录，就基于 label 生成一个稳定的伪 ID：

```python
digest = hashlib.md5(extra_label.encode()).hexdigest()
fake_id = str(int(digest[:16], 16))[:16]
```

关键是**稳定**：写进配置文件后每次复用。如果每次运行随机生成，服务端看到的就是一台全新设备，风控和额度判断都会变得不可预测。遇到 9095 时也不当作失败，而是记录「设备已被其他账号占用」，同时把该账号的积分照常读出来——失败和「没领到但状态可读」是两件事。

## 成功的定义：先把口径写下来

自动化脚本最容易出问题的地方不是代码，而是「成功」没有定义。这个项目在 README 里固定了一张口径表：

| 项目 | 规则 |
| --- | --- |
| 单账号积分 | `credits + extra_credits` |
| 是否已签到 | 只认 `checked_in`，账号维度 |
| 重复执行 | 幂等，不重复加分 |
| 失败重试 | 仅 5xx / 网络错误，退避 1s、2s、4s |

`credits + extra_credits` 这条看着琐碎，但基础积分和签到奖励是分开返回的，只取一个字段会让报表长期少算一半。WorkBuddy 那边也有类似情况：`claim` 返回 `10001` 表示「今日已签到」，语义上等于成功，如果按错误码处理，每天第二次运行都会报失败。

把口径写成表格的价值在于：**后面所有代码、日志、报告都引用同一套定义**，而不是每个函数各自解释一遍。

## 重试：只重试值得重试的错误

统一的 HTTP 封装是整份代码里最值得复用的部分：

```python
def safe_post(url, headers, json_body=None, timeout=30, retries=3):
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            r = requests.post(url, headers=headers, json=json_body or {}, timeout=timeout)
            if r.status_code < 500:          # 4xx 是确定性的，不重试
                return r.status_code, r.json() if r.content else {}
            last_err = f"HTTP {r.status_code}"
        except requests.RequestException as e:
            last_err = str(e)
        if attempt < retries:
            time.sleep(2 ** (attempt - 1))   # 1, 2, 4
    return 0, {"error": last_err or "unknown"}
```

三个约束：

1. **4xx 不重试**。Token 失效、参数错误，重试三次只是把同样的失败重复三遍，还会拖慢整批账号的处理。
2. **返回统一形态**。调用方只需要判断 `code == 0` 是网络错误、`code == 200` 是成功，不必关心底层抛了什么异常。
3. **重试要有上限**。三个账号、每个最多三次、每次最长 30 秒，最坏情况仍在可接受范围内。

还有一个不显眼但必要的等待：`claim` 成功之后，服务端积分不是立刻可读的。直接查 `status` 会拿到旧值，所以中间 `sleep(2)` 再查。**写操作之后的读，要假设存在同步延迟**，这在任何「先写后查」的接口里都成立。

## 幂等与历史：同一天只留一条可信记录

签到接口本身幂等，但脚本会被人手动重跑，也会被 API 触发。历史文件如果每次追加，同一天会出现多条记录，报表里的「累计天数」就不对了。

处理方式是写入前先看今天：

```python
if today:
    existing = [h for h in history if h.get("date") == today]
    if any(h.get("all_ok") for h in existing):
        log(f"今日 {today} 已有成功记录，跳过本次写入")
        return
    history = [h for h in history if h.get("date") != today]
```

规则是：**已有成功记录就保留最早那条，只有失败记录则允许被后来的成功覆盖**。这样「首次自动签到时间」不会因为一次手动重跑被改写，而早上失败、中午补签的情况仍能纠正状态。

数据流也刻意做成单向：

```
签到结果 → checkin_history.json（唯一事实源）→ checkin_report.html（生成物）
```

报告里的每个数字都能从 JSON 重算，`signin update-html` 可以随时重建报告而不重新签到。生成物不进版本库、不手工编辑，避免「报告和记录对不上」这种最难排查的问题。

## 双形态部署：同一份代码，两种调度

本机和容器共用 `daily_signin.py`，靠启动时的环境检测切换数据目录：

```python
IS_DOCKER = (os.environ.get("CONTAINERIZED") == "1"
             or os.environ.get("DOCKER") == "1"
             or Path("/.dockerenv").exists())
BASE_DIR = Path("/app/data") if IS_DOCKER else Path(__file__).parent
```

本机用 launchd：

- `StartCalendarInterval` 固定在 08:00；`RunAtLoad` 设为 `false`，避免每次登录都跑一遍。
- 日志分两层：`launchd.log` / `launchd.err` 是调度器输出，`checkin.log` 是业务日志。排查时先看业务日志，再确认进程有没有被拉起。
- 一个必须接受的限制：**电脑在 08:00 休眠时不会补跑**。与其做复杂的唤醒逻辑，不如提供 `signin run` 让补跑变成一条命令。

容器里跑的是 API Server 常驻进程，签到由外部调度器 `POST /api/run` 触发，或者打开 `docker-compose.yml` 里注释掉的 `schedule` 服务：

```yaml
volumes:
  - ./docker-data:/app/data
healthcheck:
  test: ["CMD", "curl", "-sf", "http://127.0.0.1:17580/api/ping"]
```

容器的关键约束只有一个：**数据必须在卷上**。镜像里不放 data 目录，容器删了重建，历史和账号配置都还在。

这里有个双形态带来的同步问题：本机跑完签到，容器里的报告不会自动更新，因为两边各有自己的挂载目录。解决办法是在本机写完历史后，把数据文件镜像到 `docker-data/`：

```python
tmp = dst.with_suffix(dst.suffix + ".tmp")
shutil.copy2(src, tmp)
os.replace(tmp, dst)
```

先写临时文件再 `os.replace`，是因为容器可能正在读这个文件。直接覆盖会出现读到半截 JSON 的窗口，而 `os.replace` 在同一文件系统内是原子的。

## 本地 API：给静态报告加按钮

HTML 报告是纯静态文件，但报告上有「重新签到」「更新 Token」「移除账号」这些按钮。做法是配套一个只监听本机的 HTTP 服务：

```python
host = os.environ.get("API_HOST", "0.0.0.0" if IS_DOCKER else "127.0.0.1")
```

几个设计取舍：

- **默认只监听 `127.0.0.1`**。报告是给自己看的，不需要对外暴露；容器里才显式改成 `0.0.0.0`，由端口映射控制访问。
- **签到放到后台线程**。`/api/run` 立即返回，前端轮询 `/api/run-status`，避免一次签到把 HTTP 请求卡住几十秒。
- **并发要挡住**。全局保存线程引用，已在运行时返回 `409`，防止连点按钮触发两次签到、写两条历史。
- **轮询返回轻量数据**。`/api/history-version` 只返回记录数和最后日期，不返回全量历史，前端据此决定要不要刷新。

这套模式很适合个人工具：**静态页面负责展示，本地服务负责动作，两者用几个 JSON 接口连接**。不需要前端框架，也不需要数据库。

## 运维细节：让失败可定位

长期运行的脚本，出问题时的排查成本比功能本身更重要。项目里有几处刻意的设计：

- **Token 健康度**。`signin status` 扫描所有登录态，按剩余有效期分三色：≥14 天绿色、7–13 天黄色、<7 天红色。等到 401 才发现过期，就意味着当天签到已经失败。
- **日志带时间戳并落盘**。`log()` 同时打印和追加写入 `checkin.log`，launchd 和容器都读得到。
- **报告不含凭据**。`checkin_report.html` 可以单独分享，里面只有积分和账号标签，没有 token。
- **故障排查表**。README 里把「IndentationError」「未找到 storage.json」「9095 设备占用」「报告按钮没反应」这些真实遇到过的现象和对应动作列成表，比事后回忆有效。

另外一条小习惯：改完 Python 先跑 `python3 -m py_compile daily_signin.py`。定时任务失败时，`launchd.err` 里往往只有一行 traceback，提前发现语法错误比等第二天早上失败更省事。

## 几条可以带走的结论

1. **凭据保存「可移植的加密形态」**，不要保存明文，也不要只保存本机才能解的东西。存储形态决定了能部署到哪里。
2. **多账号先确认服务端的维度**。设备锁下，账号必须各自有稳定身份；状态字段要看账号维度的那个，不要看设备维度的。
3. **把「成功」写成口径表**，包括积分怎么算、哪个错误码算成功、重复执行怎么处理。代码和报表都引用它。
4. **重试只针对瞬时错误**，4xx 直接失败；写后读要留同步延迟。
5. **历史是事实源，报告是生成物**。同一天只保留一条可信记录，生成物可随时重建。
6. **双形态部署靠环境检测 + 挂载卷**，跨进程共享文件用「临时文件 + 原子替换」。
7. **自动化工具要自带排查入口**：状态命令、分级日志、健康检查、故障表。凌晨失败、早上才知道，是最糟糕的失败方式。

这类项目的难点从来不是调通接口，而是让它连续跑几个月还说得清状态。接口会改、token 会过期、机器会休眠，把这些问题提前定义好，脚本才从「一次性工具」变成「可以依赖的系统」。
