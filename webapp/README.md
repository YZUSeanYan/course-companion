# 知习 · 网页版（webapp）

「知习」Android App 的网页移植版（一期：云端版）。复用 `server/` FastAPI 网关与账号额度体系，浏览器内完成课堂录音、云端实时转写与翻译、AI 学习包、文档解析和 FSRS 复习；本地数据保存在 IndexedDB。

## 功能范围（一期 · 云端）

- **听课**：麦克风采集（AudioWorklet → 16kHz PCM）→ 网关 `/v2/lecsync/realtime` 实时转写与双向翻译；开始/停止、暂停/继续、手动标记疑问；本地可选录音存档（webm）。
- **译文队列**：原文先落库，定稿行逐条经 `/v2/translate` 翻译，失败不阻塞、可重试（与 Android 同口径）。
- **AI 学习包**：课堂转写或讲义文本经 `/v2/learning-pack/jobs`（202 + 轮询，360s 超时）生成纪要/疑问解答/重点/词汇/短语/自测/练习，按固定分类展示；同内容本地查重不重复计费。
- **讲义**：PDF/PNG/JPG 上传至 `/v2/documents/analyze`（≤50MB），页面文本进入 MATERIAL 学习包。
- **复习**：ts-fsrs（官方 FSRS 参数、关闭 fuzz，与 Android `openspacedrepetition` 同源）；词汇/短语/问答/练习自动成卡；分类总览、翻面评分、跨分类连续复习、朗读。
- **账号**：匿名设备注册 + 手机号激活试用额度；额度/用量展示与错误引导解析 `X-Zhixi-Error-Code`。
- **导出**：课程 Markdown、课堂转写 Markdown 下载。
- **隐私**：正文只存本浏览器 IndexedDB；服务端只存设备 token 与手机号的 HMAC 摘要/密文。

**二期规划**：sherpa-onnx WASM 浏览器离线识别、CET6 词库导入、实时纪要（digest）、云端音频任务补转写。

## 浏览器要求

- Chrome / Edge / Safari 较新版本；HTTPS 或 localhost 才能使用麦克风。
- 录音期间页面须保持前台：浏览器安全模型不支持锁屏/后台持续录音（与 App 的核心差异）。
- 实时课堂 WebSocket 鉴权：浏览器无法设置 Authorization 头，客户端以 `Sec-WebSocket-Protocol: bearer, <token>` 携带令牌，网关 `proxy_socket` 解析并回显 `bearer`（见 `server/app/lecsync_routes.py`，对 Android 无影响）。

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

一期不实现：锁屏/后台录音、桌面小组件、系统通知、浏览器离线识别。
