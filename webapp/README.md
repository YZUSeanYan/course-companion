# 知习 · 网页版（webapp）

「知习」Android App 的网页移植版。复用 `server/` FastAPI 网关与账号额度体系，支持云端听课及可选浏览器离线识别、AI 学习包、文档解析和 FSRS 复习；本地数据保存在 IndexedDB。

> 发布状态（2026-11-11）：用户在会话中确认审阅完成并明确批准一次性生产例外，PR #106 按 head `2119055` Squash merge 为 `a617dfc`，main CI 全部通过；不是 GitHub Review 事件记录，也不修改 `AGENTS.md` 的长期限制。先切换网关 R23，再将网页版 `current` 软链切至 `/opt/zhixi-webapp/r32`；线上 `index-9L8IcNx0.js` 已确认含 ticket 与讲义恢复文案。旧版本保留，安全回退限制见 [上线检查表](../docs/ROLLOUT-20261110.md)。
>
> 网关公网健康为 `ok`、`providerConfigured=true`，ticket 接口已可见，无凭据 POST 为 401；合成无效 ticket/URL token 的 WSS 负向冒烟以 4401 拒绝，不代表真实微信音频验收。既有本地 183 项测试（22 文件）及 TypeScript/Vite 构建通过；真实微信、arm64、文件选择恢复完整端到端、生产付费 ASR 和真实课堂本轮仍未验收。
>
> 官网（与本 `/web/` 网页版分开发布）已切到 V2.0.11，签名 APK code 13 已上传且公网完整下载哈希复验通过；公网下载页版本、链接、SHA-256 展示、50.9 MB / arm64 与页脚冒烟通过，不等于 App 安装验收。完整记录见 [2026-11-11 上线进度](../docs/VERIFICATION.md#2026-11-11-上线进度)。

## 功能范围（一期 · 云端）

- **听课**：麦克风采集（AudioWorklet → 16kHz PCM）→ 网关 `/v2/lecsync/realtime` 实时转写与双向翻译；开始/停止、暂停/继续、手动标记疑问；本地可选录音存档（WAV，默认关闭）。
- **译文队列**：原文先落库，定稿行逐条经 `/v2/translate` 翻译，失败不阻塞、可重试（与 Android 同口径）。
- **AI 学习包**：课堂转写或讲义文本经 `/v2/learning-pack/jobs`（202 + 轮询，360s 超时）生成纪要/疑问解答/重点/词汇/短语/自测/练习，按固定分类展示；同内容本地查重不重复计费。
- **讲义**：PDF/PNG/JPG 上传至 `/v2/documents/analyze`（≤50MB），页面文本进入 MATERIAL 学习包。
- **复习**：ts-fsrs（官方 FSRS 参数、关闭 fuzz，与 Android `openspacedrepetition` 同源）；词汇/短语/问答/练习自动成卡；分类总览、翻面评分、跨分类连续复习、朗读。
- **账号**：匿名设备注册 + 手机号两步验证码激活（发送验证码 → 60 秒重发倒计时 → 6 位验证码激活）；额度/用量展示与错误引导解析 `X-Zhixi-Error-Code`。
- **云空间同步**：`/v1/sync/push`、`/v1/sync/pull`（账号级、LWW 合并，见 `src/lib/sync/sync.ts`）；设置页可手动同步，激活成功与学习包落库后自动触发；仅同步学习元数据与文本，**不包含课堂音频与任何密钥**。
- **导出**：课程 Markdown、课堂转写 Markdown 下载。
- **隐私**：正文只存本浏览器 IndexedDB；同步云端的数据不含音频；服务端只存设备 token 与手机号的 HMAC 摘要/密文。

**二期功能**：实时纪要（digest）、WAV 本地存档 + 云端补转写、CET6 词库导入、**浏览器离线识别**（sherpa-onnx WASM，见下）。

## 浏览器离线识别（二期）

- 模型：`sherpa-onnx-wasm-simd-v1.13.7-zh-en-asr-zipformer`（流式中英 Zipformer，SIMD，Apache-2.0），上游 <https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.7>；产物 js/wasm/data 全部在运行时从镜像下载、SHA-256 锚定校验后存 Cache API，仓库不提交任何模型/二进制。
- 镜像发布步骤（与 Android 模型镜像同域）：
  1. 下载上游 `sherpa-onnx-wasm-simd-v1.13.7-zh-en-asr-zipformer.tar.bz2`（完整包，含 .wasm 与带模型的 .data）；
  2. 解压，把 `sherpa-onnx-asr.js`、`sherpa-onnx-wasm-main-asr.js`、`sherpa-onnx-wasm-main-asr.wasm`、`sherpa-onnx-wasm-main-asr.data` 四个文件上传到 `https://shuike.seanyan.store/models/zhixi/web/asr-zh-en-v1/`；
  3. `sha256sum` 四个文件，模型更新时同步登记 `src/lib/offline/model-manager.ts` 的 `OFFLINE_ASR_MODEL.assets` 哈希与字节数（当前四项均已登记）；
  4. 本地联调：设置页「离线识别模型镜像」可覆盖根地址（如 `http://127.0.0.1:8901/`）。
- 离线模式不消耗账号额度；识别失败或需要翻译/纪要时在课堂设置切回云端。设置页可随时覆盖镜像地址。

**一期不实现（浏览器限制）**：锁屏/后台录音、桌面小组件、系统通知。

## 浏览器要求

- Chrome / Edge / Safari 较新版本；HTTPS 或 localhost 才能使用麦克风。
- 录音期间页面须保持前台：浏览器安全模型不支持锁屏/后台持续录音（与 App 的核心差异）。
- 实时课堂 WebSocket 鉴权：桌面浏览器以 `Sec-WebSocket-Protocol: bearer, <token>` 携带设备令牌，网关 `proxy_socket` 解析并回显 `bearer`（见 `server/app/lecsync_routes.py`，对 Android 无影响）。iOS 微信等 WKWebView 会丢子协议，这类环境改走 URL query `ticket=`：先 `POST /v2/lecsync/realtime/ticket` 换一张 60 秒、只能用一次的 ticket（`src/lib/api/client.ts`、`src/lib/classroom.ts`）。长期设备令牌不允许出现在 URL 里——否则会留在 Uvicorn/nginx 访问日志中，网关对 `?access_token=` 直接 4401。

## 历史讲义恢复

课程页「恢复预览」要求重新选择原文件：浏览器先核对 `SHA-256(file)[:24]` 与旧 `documentId`，不一致则不上传、不改旧记录。校验通过后由用户主动上传并重新解析，消耗文档解析额度，不生成学习包；保留讲义标题、同步 uid、首次导入时间及来源标识。缺少原文件校验信息的记录不能安全原地恢复，应另行导入为新讲义。

安全发布顺序、回滚限制和真机验收见 [上线检查表](../docs/ROLLOUT-20261110.md)。

## 本地开发

```bash
cd webapp
npm install
npm run dev        # http://localhost:5174，/v1 /v2 代理到 127.0.0.1:8765（本地网关）
npm test           # vitest
npm run build      # tsc --noEmit && vite build
```

网关地址在「设置」页配置；开发代理仅用于本地调试。默认值可用 `VITE_ZHIXI_GATEWAY_URL` 注入构建。

## 与 Android 端的对应关系

| 模块 | webapp | Android |
|---|---|---|
| 存储 | `src/lib/db/db.ts`（Dexie/IndexedDB） | `data/ClassroomDatabase.kt`、`learning/LearningEntities.kt`（Room） |
| 网关客户端 | `src/lib/api/client.ts` | `learning/api/LearningApiClient.kt` |
| 实时课堂 | `src/lib/audio/realtime.ts`、`src/lib/classroom.ts` | `audio/LecsyncRealtimeEngine.kt` |
| 学习包落库 | `src/lib/pack.ts`、`src/lib/generate.ts` | `learning/LearningPresenter.kt` |
| 复习调度 | `src/lib/fsrs/scheduler.ts` | `learning/review/ReviewScheduler.kt` |
| 分类 | `src/lib/pack.ts`（`LEARNING_CATEGORIES`） | `learning/LearningCategories.kt` |
| 云空间同步 | `src/lib/sync/sync.ts`（uid + LWW，分批 ≤400 条） | 同一 `/v1/sync` 网关契约，各端独立实现 |

浏览器限制下不实现：锁屏/后台持续录音、桌面小组件、系统通知。浏览器离线识别已实现，模型下载与运行仍受浏览器兼容性和前台生命周期限制。
