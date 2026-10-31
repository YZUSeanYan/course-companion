# Course Companion 学习分析服务

独立的 FastAPI 服务，将讲义/字幕块转换为带来源引用的结构化学习包。首版只有匿名设备，没有用户账户。服务不会修改或依赖 Android app。

## 安全与数据边界

- 注册时返回一次设备 bearer token；数据库只保存 `HMAC-SHA256(token, TOKEN_PEPPER)`，没有 token 找回接口。
- SQLite 仅保存设备、每日用量和分析元数据（哈希、版本、模型、时间），不保存 `courseName`、`glossary`、讲义或字幕正文。
- 应用不写内容日志。uvicorn 的默认访问日志只应配置为请求元数据，不要启用请求/响应 body 日志。
- provider URL 只能来自服务端 `AI_PROVIDER_BASE_URL`，仅支持 HTTP/HTTPS。每次请求前会解析主机并拒绝 localhost、环回、私有、保留、link-local、multicast、unspecified 和其他非全局地址，包括 DNS 解析结果；不跟随重定向，也不会获取请求中的 URL。
- 429、5xx、超时和连接错误采用有界指数退避。`AI_PROVIDER_MAX_RETRIES` 是首次请求之外的最大重试数（0 到 3）。内容 JSON/schema 错误只发起一次包含校验错误的修复请求。
- 未完整配置 provider 时 `/health` 仍可用，`/v1/analyze` 明确返回 503，不生成模拟学习结果。`providerConfigured=true` 只表示服务端配置完整，不代表已发起付费模型请求或验证模型质量。
- Android 设置页可修改服务地址。模拟器使用 `http://10.0.2.2:8765`；真机不能使用该特殊地址，需使用可信局域网中的电脑地址或已部署的 HTTPS 服务。

## 本地开发

需要 Python 3.11+。所有依赖安装到本目录的 `.venv`：

```bash
cd C:/dev/course-companion/server
python -m venv .venv
# Git Bash
source .venv/Scripts/activate
python -m pip install -r requirements-dev.txt
```

根据 `.env.example` 在环境管理器或当前 shell 中设置变量。该文件只是占位示例，应用不会自动加载 `.env`，也没有默认密钥。`TOKEN_PEPPER` 应是稳定的高熵随机值；更换后已有设备 token 将全部失效。

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
```

默认数据库是当前工作目录下的 `learning_analysis.db`，可通过 `DATABASE_PATH` 改为其他 SQLite 文件。

## Lecsync 全功能统一网关

`LECSYNC_API_KEY` 仅由服务端环境变量/密钥服务提供，不进入 APK。所有官方 REST、Realtime 和 Voice Typing WebSocket 都经 `/v2/lecsync/*` 转发，APP 只使用匿名设备 token，不获得上游 key、一次性 socket token、上传/录音签名 URL 或 Webhook secret。

支持：

- `GET /v2/lecsync/models` 与 `POST /v2/lecsync/translate`，`GET /v2/lecsync/requests/{id}`；完整 context/terms/language/model、官方 `result` 包装与 pending 恢复。
- `POST /v2/lecsync/audio/transcriptions` 同步转写；`/audio/jobs` 上传/任务/状态/分页/取消/删除，`/audio/jobs/url` 公网音频链接。音频大小、时长、格式与实际 usage 由服务端核验。
- `POST /v2/lecsync/voice-typing` 和 `/voice-typing/ws`；不可重放的最终文本及时保存。
- `/v2/lecsync/realtime` 自有 WebSocket 代理，支持语言提示、单语言对双向翻译、说话人、术语/背景、AI 润色、实时纪要、区域、可选存储和实际用量事件。
- `/v2/lecsync/recordings/{id}` 查看/删除，`.../audio`、`.../transcript` 经网关下载。未开启 30 天存储时不提供这些操作。
- `/admin/lecsync/webhooks/*` 使用独立 `LECSYNC_ADMIN_TOKEN`，仅服务端管理。入站 `/v2/lecsync/webhooks/events` 验证 HMAC、时间窗和去重；secret 由 `TOKEN_PEPPER` 派生密钥加密保存。

完整矩阵见 `../docs/LECSYNC_COMPATIBILITY.md`。Realtime/音频转写按实际音频时长，文本翻译按源字符，Voice Typing 按最终文本字符；不能把所有接口都描述成按时长免费。

## V2 文本翻译：Lecsync 优先

设置 `LECSYNC_API_KEY` 后，`POST /v2/translate` 会先调用固定的官方端点 `https://api.lecsync.com/v1/translate`，仍执行共享的公网 URL/DNS 校验。请求使用 `source_lang=auto`、`model=translate-default`，并将 `zh-CN`/`en-US` 分别映射为 `zh`/`en`。`Idempotency-Key` 由 `lineId`、`sourceHash` 和目标语言组成，是稳定、可见的 ASCII 字符串。该接口不读取 Lecsync base URL、模型或超时等其他环境变量。

只有状态为 `succeeded` 且译文非空的确定响应才会作为翻译结果，响应中的实际 `model` 会原样用于 `TranslateResponse.model`。`accepted`/`processing` 不会当作译文；服务会根据响应中的 `request_id` 对 `/v1/requests/{request_id}` 做有界状态查询。HTTP 504 且响应明确给出 `request_id` 时也先查询原请求。若网络响应丢失且没有 `request_id`，无法按文档构造查询，服务不会猜测 ID 或盲目重复 POST。

Lecsync 未配置、不可用、超时或响应无效时，继续使用现有 V2Provider 的 DeepSeek → Kimi → MiMo 回退链；设备鉴权、响应 schema 和 `/v1` 行为不变。密钥不会写入响应或应用日志。

## 多提供方顺序回退

除单一 `AI_PROVIDER_*` 配置外，可用以下环境变量按顺序尝试：DeepSeek `deepseek-flash` → Kimi `k3.1-pro-highspeed` → MiMo `mimo-v2.6-flash`。对应密钥变量为 `DEEPSEEK_API_KEY`、`KIMI_API_KEY`、`MIMO_API_KEY`。每个提供方都执行公网 URL/DNS 校验、独立超时与有界重试；HTTP 错误、网络错误或超时后切换下一个。响应 `model` 是实际成功的模型，密钥不会进入日志或响应。

模型选择本身用于低延迟，不额外发送思考参数；如提供方默认开启思考，应在提供方控制台选非推理/最低思考配置，不能伪造一个文档未确认的请求字段。Kimi `k3.1-pro-highspeed` 按接口要求固定 `temperature=1`，其他提供方使用低温度。学习包会对常见的 `translation/definition/en/zh/point/sourceId` 等字段做确定性归一化，再执行严格 schema 与来源 ID 校验；失败时只进行一次带错误说明的修复请求。

## 复杂图像视觉回退

显式设置完整的 `VISION_PROVIDER_BASE_URL`、`VISION_PROVIDER_MODEL`、`VISION_PROVIDER_API_KEY` 时，该端点优先。未显式配置时，服务端自动复用已有提供方密钥，按 MiMo `mimo-v2.6-pro` → DeepSeek `deepseek-flash` 回退；可用 `VISION_MIMO_MODEL`、`VISION_DEEPSEEK_MODEL` 覆盖模型名。只有已用合成图确认能读取图像的模型才会加入视觉链，纯文本模型不会接收图片。每个视觉端点都执行公网 URL/DNS 校验、超时与错误回退，返回内容仍须通过严格 schema 和 `visualNotes.sourceId` 来源校验。

## API

### `GET /health`

无需鉴权：

```json
{"status":"ok","providerConfigured":false}
```

### `POST /v1/devices/register`

无需请求 body。成功为 `201`：

```json
{
  "deviceId": "7d7d0e18-...",
  "token": "仅此次返回的随机令牌",
  "tokenType": "bearer"
}
```

同一客户端 IP 有基础注册限流。后续分析使用 `Authorization: Bearer <token>`。

### `POST /v1/analyze`

`sourceId` 必须在本次输入中唯一。`startMs`/`endMs` 必须成对出现且 `endMs > startMs`；`page` 从 1 开始。最多 100 块，每块正文最多 20,000 字符，总正文最多 200,000 字符。

```json
{
  "courseName": "生物学导论",
  "language": "zh-CN",
  "glossary": [{"term":"mitosis","definition":"有丝分裂"}],
  "chunks": [
    {"sourceId":"slide-1","text":"Mitosis produces two genetically identical cells.","page":3},
    {"sourceId":"audio-1","text":"The chromosomes separate.","startMs":1000,"endMs":2400}
  ],
  "requestedOutputs": ["summary","vocabulary","phrases","keyPoints","questions","quizCards"]
}
```

响应包含可追溯元数据和学习包。非请求的数组为空；请求的数组至少有一项。每项的 `sourceIds` 必须来自输入。词汇和短语同时包含 `definitionZh`、`definitionEn` 和 `example`。

```json
{
  "analysisId": "3c5f...",
  "inputSha256": "64位小写SHA-256",
  "promptVersion": "learning-pack-v1",
  "schemaVersion": "1.0",
  "model": "配置的模型名",
  "package": {
    "summary": [{"text":"...","sourceIds":["slide-1"]}],
    "vocabulary": [{
      "term":"mitosis","definitionZh":"有丝分裂","definitionEn":"Cell division producing two genetically identical cells.",
      "example":"Mitosis produces two cells.","sourceIds":["slide-1"]
    }],
    "phrases": [],
    "keyPoints": [{"text":"...","sourceIds":["slide-1"]}],
    "questions": [{"question":"...","answer":"...","sourceIds":["slide-1"]}],
    "quizCards": [{"front":"...","back":"...","sourceIds":["slide-1"]}]
  }
}
```

严格 schema 禁止额外字段并限制数组与文本长度。成功响应使用 `200`；输入校验失败为 `422`；无效 token 为 `401`；限流/每日配额为 `429`；provider 配置或可用性问题为 `503`；provider 无效响应经一次修复仍失败为 `502`。

## 测试

测试使用临时 SQLite 数据库和 `httpx.MockTransport`，不会访问真实模型：

```bash
python -m pytest
```
