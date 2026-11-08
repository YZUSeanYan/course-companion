# Course Companion 学习分析服务

独立的 FastAPI 服务，将讲义/字幕块转换为带来源引用的结构化学习包。访问使用匿名设备令牌；AI/云端功能还需激活管理员发放的手机号试用额度。服务不会修改或依赖 Android app。

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

## 试用账号与运营后台

- `POST /v1/accounts/activate`（设备 bearer）用管理员预先添加的手机号激活当前设备；`GET /v1/accounts/me` 返回激活状态、脱敏号码、有效期、每日额度和今日用量，未激活也返回 200 方便 App 引导。
- 手机号用 `HMAC-SHA256(手机号, TOKEN_PEPPER)` 查找，用 `ACCOUNT_ENCRYPTION_KEY` 派生的 Fernet 密钥加密保存；App 本地只存脱敏号码。一个手机号可绑定多台设备，额度按账号每日汇总。
- AI 学习包、翻译、云端音频、实时课堂和文档解析在未激活、停用、到期或额度耗尽时返回可执行的中文错误；`detail` 保持字符串，同时返回 `X-Zhixi-Error-Code`、`X-Zhixi-Quota-Scope` 等头供新版 App 精确引导。`REQUIRE_ACCOUNT_ACTIVATION=false` 是紧急回退，会恢复旧的按设备默认额度。
- 运营后台 API 位于 `/admin/api/*`：登录/登出/会话、概览、账号 CRUD/批量添加/解绑、设备、请求记录。管理员密码来自 `ADMIN_PASSWORD`，会话签名来自 `ADMIN_SESSION_SECRET`（或 `TOKEN_PEPPER`）；cookie 为 HttpOnly + Secure + SameSite=Strict，写操作要求 `X-Requested-With: zhixi-admin`。
- 构建后的 `admin/dist` 通过 `ADMIN_DIST_DIR` 挂载到 `/admin/`；未设置或目录不存在时不挂载。现有 `/admin/lecsync/webhooks/*` 仍使用 `LECSYNC_ADMIN_TOKEN`，两者互不替代。
- 每个 `/v1/*`、`/v2/*` 请求会写入 `api_requests`（设备、账号、方法、路由模板、状态码、耗时、时间），不含 query 明文或请求正文；`/health`、`/admin/*` 不计入服务用量。WebSocket 在关闭时单独记录。
- 手机号、管理员密码、会话密钥、加密密钥只能来自服务器环境变量；不要写入源码、示例、测试、APK 或前端 bundle。

## 官网试用申请

- `GET /v1/trial/status` 返回短信通道是否已配置和默认额度，官网申请页据此在未配置时显示“短信通道配置中”并禁用发送，避免用户填完才失败。
- `POST /v1/trial/request-code` 接收手机号，校验格式、是否已注册、手机号/IP 限流和 60 秒重发冷却后，通过阿里云短信发送 6 位验证码。
- `POST /v1/trial/apply` 校验验证码、姓名、昵称和同意标记，成功后自动创建账号：默认每天 5 个 AI 学习包、30 分钟云端音频，翻译字符/文档解析/设备数沿用 `ACCOUNT_DEFAULT_*`，有效期按北京时间自然月 +2 个月。姓名写入账号备注，昵称写入显示名，管理后台立即可见。
- 验证码 5 分钟有效、最多错误 5 次，单次使用；数据库只保存 HMAC 摘要，不保存明文。手机号仍使用 Fernet 密文保存。
- 阿里云号码认证（PNVS）短信认证配置：`ALIYUN_SMS_ACCESS_KEY_ID`、`ALIYUN_SMS_ACCESS_KEY_SECRET`、`ALIYUN_SMS_SIGN_NAME`、`ALIYUN_SMS_TEMPLATE_CODE`、`ALIYUN_SMS_REGION`（默认 `cn-hangzhou`）。服务端调用 `https://dypnsapi.aliyuncs.com/` 的 `SendSmsVerifyCode`，不是独立的短信服务（Dysms）。
- 必须使用 PNVS 控制台“短信认证参数配置”中审核通过的系统赠送签名和模板。当前生产使用签名 `恒创联众`、登录/注册模板 `100001`，模板变量为 `code` 和 `min`。服务端自行生成 6 位验证码并以具体值填入 `TemplateParam`，阿里云只负责发送，验证码仍由本站按 HMAC 摘要校验；AccessKey 只需具备 PNVS 的 `SendSmsVerifyCode` 权限。
- 未配置时 `/v1/trial/status` 返回 `smsConfigured=false`，申请页禁用发送；不要用未开通的 Dysms 签名/模板代替。
- 未配置短信时接口返回 503 `sms_not_configured`，官网申请页会明确提示；后台手动添加手机号不受影响。官网 `shuike.seanyan.store/api/trial/*` 由 nginx 反代到 `/v1/trial/*`，保持同源，不需要 CORS。
- 可调参数：`TRIAL_DEFAULT_AI_PACKS`、`TRIAL_DEFAULT_AUDIO_MINUTES`、`TRIAL_DEFAULT_VALID_MONTHS`、`TRIAL_CODE_TTL_SECONDS`、`TRIAL_CODE_MAX_ATTEMPTS`、`TRIAL_CODE_RESEND_SECONDS`、`TRIAL_CODE_PER_PHONE_HOUR`、`TRIAL_CODE_PER_IP_HOUR`、`TRIAL_APPLY_PER_IP_HOUR`。

## 激活验证码

- `POST /v1/accounts/activate/request-code`（设备 bearer 鉴权）向已在 `access_accounts` 中且状态为 active 的手机号发送 6 位激活验证码：响应 `{"sent":true,"phoneMasked":"139****0997","cooldownSeconds":60}`。手机号未注册返回 404 `account_not_found`，停用/到期沿用 `account_disabled`/`account_expired` 语义。
- 验证码 5 分钟有效（`ACTIVATION_CODE_TTL_SECONDS`）、最多错误 5 次（`ACTIVATION_CODE_MAX_ATTEMPTS`）、同手机号 60 秒重发冷却（`ACTIVATION_CODE_RESEND_SECONDS`）。数据库只在 `activation_codes` 表保存 HMAC 摘要，并记录申请设备 ID，绝不保存明文。
- 限流：每手机号 10 次/小时、每设备 20 次/小时、每 IP 30 次/小时（`ACTIVATION_CODE_PER_PHONE_HOUR`、`ACTIVATION_CODE_PER_DEVICE_HOUR`、`ACTIVATION_CODE_PER_IP_HOUR`）。
- `POST /v1/accounts/activate` **必须提供** `code` 字段（6 位数字），服务端验证并消耗验证码后才能绑定设备；缺码返回 403 `activation_code_required`。不再支持旧版无验证码绑定流程（即使旧部署误配 `REQUIRE_ACTIVATION_CODE=false`）。
- 上线前确认 Android / 网页版客户端均已更新为两步验证流程；更改配置不足以恢复旧的无验证码激活。

## 账号级云空间同步

- `POST /v1/sync/push` 与 `POST /v1/sync/pull`（均要求已激活设备）按账号（不是按设备）同步学习数据，多设备登录同一手机号共享同一份云空间。
- 同步实体白名单：`courses`、`learning_items`、`review_cards`、`review_logs`、`sessions`、`transcript_lines`、`doubts`、`materials`。数据整包存于 `sync_records.payload`（JSON 文本，单条 ≤128KB），服务端不理解其内部结构。
- push 请求 `{"changes":[{"entity","clientUid","payload","updatedAt","deleted"}]}`，单批最多 500 条；`clientUid` 必须是 36 位 UUID（服务端统一按小写存储）；冲突按 last-write-wins 处理：库内 `client_updated_at` >= 新 `updatedAt` 时忽略，否则整体替换。响应逐条返回 `accepted` 或 `ignored` 及 `serverTime`（毫秒）。
- pull 请求 `{"entities":[...]}`，空数组表示全部白名单实体；响应 `{"records":[{"entity","clientUid","payload","updatedAt","deleted"}],"serverTime"}`，只含本账号记录。删除用 `deleted=true` 的记录表示（墓碑），不做物理删除。
- `/v1/sync/*` 与其他接口一样只写 `api_requests` 元数据审计（方法、路由、状态码、耗时），不记录 payload 内容，日志中也不得输出任何 payload 正文。

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

### 学习包后台任务

手机网络不适合长时间等待没有响应字节的同步请求。客户端可先创建任务，再用短连接轮询：

```text
POST /v2/learning-pack/jobs
Authorization: Bearer <device token>
Content-Type: application/json
```

请求体与同步 `/v2/learning-pack` 相同，成功立即返回 `202`：

```json
{"jobId": "b3fd9d7e-6d8f-4f60-a8c5-112233445566", "status": "queued"}
```

轮询接口：

```text
GET /v2/learning-pack/jobs/{jobId}
Authorization: Bearer <device token>
```

`status` 为 `queued`、`processing`、`succeeded` 或 `failed`。成功时 `result` 与同步响应的完整结构相同；失败时只返回脱敏的 `error.code` 和中文 `error.message`。其他设备读取同一 jobId 返回 `404`。

```json
{"jobId":"...","status":"failed","error":{"code":"provider_unavailable","message":"AI 服务暂时不可用，请稍后重试。"}}
```

同一设备的相同规范化请求会复用正在运行的任务；15 分钟内成功的同请求也直接复用，避免重复计费。任务状态持久化到 SQLite，服务重启时未完成任务会标记失败，不会假装仍在运行。原同步接口继续保留用于兼容。

## 测试

测试使用临时 SQLite 数据库和 `httpx.MockTransport`，不会访问真实模型：

```bash
python -m pytest
```
