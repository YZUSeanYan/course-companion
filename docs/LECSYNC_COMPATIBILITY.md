# Lecsync 全功能兼容矩阵

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
- 断线只对官方允许的情况新建连接，不能声称恢复原 socket。重传配置但不盲目重发可能已计费音频。
- 定稿原文先由 `RecordingService` 持久化，取得 Room 行 ID 后再关联译文；增强译文按 segment 替换。
- 网络回调迟迟未返回时有独立 8 秒回退看门狗；本机模型可用则同一课堂切到 sherpa，不可用才报告失败。

## 隐私与配额

- 云端听课/导入音频需主动确认；离线听课仍是默认路径。
- 云端录音与转写默认不保存。只有明确开启 `store` 才使用 Lecsync 30 天存储，并提供网关下载和删除。
- 任务表只保存设备归属、任务 ID、状态、用量和时间，不保存课堂正文。Webhook secret 使用 `TOKEN_PEPPER` 派生密钥加密保存。
- 旧 `/v2/translate` 同样执行 source hash 重算、按设备缓存隔离与配额，不以客户端声明的 hash 获取其他设备的译文。

## 验证边界

本矩阵描述协议覆盖，不等于真实模型质量认证。自动化使用官方响应形状、HTTP mock 和本地 WebSocket 假上游，不调用真实付费模型。真实凭据联调需要由服务端环境注入密钥后，使用小额合成内容验证并核对实际 usage。
