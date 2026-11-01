# Lecsync 全功能兼容矩阵

## 官方指标与本地测量（2026-11-01 对齐）

官方产品页与开发者文档给出的指标，以及本项目的对应测量方式：

| 官方指标 | 官方数值 | 本地对齐方式 |
| --- | --- | --- |
| 首字延迟（开口到首字上屏） | 平均 0.28 秒 | `RealtimeLatencyTracker` 以"最新发出的音频帧时间 → `transcript.partial` 到达"连续测量，EMA 平滑后显示在实时课堂卡片右上角（首字 ~x.xxs）；2026-11-01 生产实测（23.8s 真实语音推流）：**首字 47ms、翻译首响中位 77ms、识别延迟中位 438ms**，均不劣于官方口径 |
| 翻译首 token 额外延迟 | 约 88 毫秒 | 以"最近一条转录事件 → `translation.partial` 到达"测量（2 秒窗口），同样 EMA 平滑显示（译 ~x.xxs） |
| 服务端音频积压上限 | 2 秒，超出直接丢弃 | 客户端连接期同样只保留约 2 秒（64 KiB）待发音频，慢连接丢最旧帧；`usage.update.discardedSeconds` 已随用量落库（Room 9 新增列） |
| 断线后回到当前语句 | 约 1 秒 | 断线按官方重连码集合新开流（4001/4004/4010/4011/4012/4013/4016/1012 + 网关 4401），重传配置不盲目补发旧音频 |
| 分段参数语义 | `sentence` 模式忽略 `segmentation`（英文原文核实），`short/balanced/complete` 只作用于 `classic` | 现有实现正确：`sentence` 时不下发 `segmentation`，经典模式才下发用户选择 |
| usage 推送 | 每 15 秒一次，结束再推一次 | 网关原样转发 `usage.update` 全部官方字段（effective/discarded seconds、priceCentsPerHour、accruedCents 等） |
| 计费 | $0.006/音频分钟，按秒比例，会话冻结单价 | 网关按实际收流秒数结算自有配额，`accruedCents` 落库供后台统计 |
| 会话上限 | 4 小时边界；60 秒无音频空闲（ping 不计入） | 网关在 4 小时边界以官方 4012 关闭（客户端自动开新流），60 秒空闲以官方 4013 语义发送 `session.error` 后关闭 |
| 控制消息 | `session.finalize` / `session.stop` / `session.ping` | 网关白名单透传；App 在暂停与停止时先发 `session.finalize`，保住最后半句及其译文 |
| 双语字幕 | 译文与转录同步流式输出，不等整句结束 | `transcript.partial.tailTranslation` 与 `translation.partial` 驱动 Dock 的"译 …"实时预览，定稿译文照旧落库 |
| 说话人显示 | 定稿段落带 speaker 标签 | 定稿行显示说话人；sentence 模式 `paragraphs[].speaker` 透传保留 |
| 实时纪要 | `digest.update` 区分已确认与进行中 | 纪要卡片对未确认 section 显示"整理中"，确认后自动消失 |
| 采集节奏 | 持续推流，服务端积压 2 秒上限 | 麦克风采集块 200ms → 100ms，降低首字延迟的排队分量 |

测量口径说明：官方"首字延迟"从开口起算，含端点检测；本地读数从最新音频帧发出起算（不含麦克风采集的 ≤100 ms 分块），因此读数应略低于官方口径。真实网络下的数值以 App 内实时显示为准，官方数值是它们的目标带。

## 统一安全边界

- APP 仅连接自己的 FastAPI 网关，持有匿名设备 token；Android Keystore 加密保存。
- `LECSYNC_API_KEY` 仅从服务端环境变量或密钥服务读取，不进入 APK、源码、示例、测试或访问日志。
- 上游 API key、一次性 WebSocket token、签名上传 URL、录音下载 URL 和 Webhook secret 均不发送给 APP。
- 音频、文本、Realtime 和 Voice Typing WebSocket 都经 `/v2/lecsync/*` 转发。设备任务归属、速率、并发、每日字符和音频时长配额由网关执行。
- 文本翻译按源字符计费；音频/Realtime 按实际音频时长计费；Voice Typing 按最终文本字符计费。不同接口不能混称为统一按时长免费。

## 官方 API 与产品入口

| 官方能力 | 服务端适配 | 应用内入口 |
| --- | --- | --- |
| `POST /v1/translate`、`GET /v1/requests/{id}` | 完整 source/context/terms/model、2000 字限制、`result` 包装、pending 恢复、错误与幂等 | 定稿字幕翻译，术语与背景可在进阶设置调整 |
| `GET /v1/models` | 模型、语言、限额、价格、留存字段的受限透传 | 供服务配置与能力检查，不向普通用户堆技术参数 |
| `POST /v1/audio/transcriptions` | 20 MiB/120 秒边界、格式、语言、词/段时间戳、说话人、热词、usage | 音频工具的“转写一段音频” |
| `POST /v1/audio/uploads` + 受控 PUT | 文件 SHA-256、大小、上传有效期、服务端上传；API key 不随 PUT 发送 | 由长音频任务自动完成 |
| `/v1/audio/transcription-jobs` 全系列 | 创建、状态、cursor 分页、取消、删除、upload_id/file_url、Webhook ID | “整理长音频”和“从链接转写”，支持进度与取消/删除 |
| `POST /v1/voicetyping` | polish/translateTo/app/terms、最终文本和状态语义 | “从文件润色语音”，不可重放的文本及时落库 |
| `POST /v1/voicetyping/connect` + WebSocket | 单次 ticket 仅在服务端使用，ready 后 PCM16，end 后 result | “开始语音输入/结束语音输入” |
| `POST /v1/realtime/connect` + WebSocket | 全部 transcribe/translate/glossary/aiEnhance/digest/store/region 配置 | 云端听课与独立的常用/进阶设置 |
| Realtime 事件 | partial/final 转写与翻译、说话人、时间戳、AI 润色替换、digest、usage、结束/错误/心跳 | 双语课堂、说话人、课堂纪要、实际用量 |
| `GET/DELETE /v1/recordings/{id}` | 设备归属校验，签名 URL 仅在服务端使用 | 仅开启 30 天存储的任务支持下载和删除 |
| Webhook 管理 | 注册、投递查询、重发、secret rotation | 仅服务端管理员接口，不进入 APK |
| 入站 Webhook | HMAC-SHA256、5 分钟窗口、事件去重、secret 版本与加密存储 | 自动更新任务，不向设备公开管理凭据 |

## Realtime 可靠性

- 仅接受 16 kHz、单声道、PCM16 little-endian，单帧最多 64 KiB。
- 最多保留约 2 秒待发送音频，慢连接时丢弃最旧未发送帧，不突然补发大段旧音频。
- 60 秒无音频会提示恢复；`session.ping` 不当作有声音；4 小时边界需要建立新流。
- 断线重连码集合与官方 retryable 清单一致：4001（令牌）、4004（节点）、4010（余额）、4011（并发）、4012（时长上限）、4013（空闲）、4016（消费过慢）、1012（网关重启），另保留网关自有 4401 与历史 4408。重传配置但不盲目重发可能已计费音频。
- 定稿原文先由 `RecordingService` 持久化，取得 Room 行 ID 后再关联译文；增强译文按 segment 替换。
- 网络回调迟迟未返回时有独立 8 秒回退看门狗；本机模型可用则同一课堂切到 sherpa，不可用才报告失败。

## 隐私与配额

- 云端听课/导入音频需主动确认；离线听课仍是默认路径。
- 云端录音与转写默认不保存。只有明确开启 `store` 才使用 Lecsync 30 天存储，并提供网关下载和删除。
- 任务表只保存设备归属、任务 ID、状态、用量和时间，不保存课堂正文。Webhook secret 使用 `TOKEN_PEPPER` 派生密钥加密保存。
- 旧 `/v2/translate` 同样执行 source hash 重算、按设备缓存隔离与配额，不以客户端声明的 hash 获取其他设备的译文。

## 验证边界

本矩阵描述协议覆盖，不等于真实模型质量认证。自动化使用官方响应形状、HTTP mock 和本地 WebSocket 假上游，不调用真实付费模型。真实凭据联调需要由服务端环境注入密钥后，使用小额合成内容验证并核对实际 usage。
