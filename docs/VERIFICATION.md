# 知习 · 本地验收记录

验收日期：2026-10-31 至 2026-11-01。范围包括本地模拟器、设备仪器测试、本机 FastAPI、mock 模型，以及正式 HTTPS 网关的小额合成内容联调；不包含全部真实模型与完整生产质量认证。

## 自动化结果

- Android JVM：**83 项单元测试，0 失败**，包含课堂、导入、DTO、FSRS、CET6 CSV/TSV 词表、AI 地址校验、术语编辑格式、AI 错误数组、文本 PDF 视觉需求、学习/讲义列表复合 key、学习内容分类顺序与未知类型回退、复习分类到期统计、试用手机号规范化、账号 DTO、真实下载字节进度、镜像回退与完整性校验、Realtime 重连码对齐与云端延迟 EMA 测量。
- FastAPI：**103 项 pytest 通过**，包含完整 Lecsync REST/Realtime/Voice Typing、提供方字段归一化、Kimi 温度约束、schema 修复失败后的跨提供方回退、视觉模型复用现有密钥与 MiMo→DeepSeek 回退、学习包异步任务创建/轮询/去重/跨设备隔离/总超时/重启恢复、试用账号激活/停用/到期/设备上限、多设备共享额度、官网短信申请/验证码校验/自动开户/默认额度/防刷限流、PNVS `SendSmsVerifyCode` 请求参数与错误码、`session.finalize` 控制消息透传、管理后台登录/CSRF/账号 CRUD/批量导入/统计、请求日志、手机号密文存储、幂等、配额、Webhook 加密与验签、页面资产、上传和密钥不泄露。
- Android lint、debug、release、debugAndroidTest：全部成功。官网 TypeScript/Vite 构建成功，本轮下载页与发布常量定向 ESLint 通过；全仓模板组件仍有此前已知的 8 项 lint 规则错误，本次未改动这些模板。运营后台 `npm ci && npm run build` 成功。
- **25 项设备测试全部通过**：Room 2→9 迁移（含 cloud_tasks `discardedSeconds` 新列与旧行默认 0）、旧课堂/复习卡/历史自动识别保留、模型隔离与回收站恢复、中文与英文 ASR、录音暂停/继续/停止且 session 不变、学习包后台任务轮询成功/失败/鉴权恢复、本地重复学习包去重、试用额度激活请求与错误码头、Realtime 消息与过期令牌恢复、云端失败→本机识别回退，以及课堂/复习 UI fixture。

## 正式部署与真实联调

- 正式网关 `https://zhixi.seanyan.store/health` 返回 200 和 `providerConfigured=true`；systemd `zhixi-gateway` 为 active，后端仅绑定 `127.0.0.1:8766`。当前运行 `/opt/zhixi-gateway-20261101-r13`，R12/R11/R10/R9/R8/R7/R6/R5/R4/R3 与旧 unit 均保留用于回滚。
- 运营后台 `https://zhixi.seanyan.store/admin/` 已上线，nginx 原有 `location /` 代理全部路径，无需新增 location。管理员密码、`ADMIN_SESSION_SECRET`、`ACCOUNT_ENCRYPTION_KEY` 只写入服务器 `/opt/zhixi-gateway/.env`（600）；登录后 `/admin/api/session` 返回 `authenticated=true`，概览、账号、设备、请求页均返回 200。页面使用 HttpOnly + Secure + SameSite=Strict 签名 cookie，写操作要求 `X-Requested-With: zhixi-admin`。管理员密码最小长度已按用户要求调整为 8 位（建议 12 位以上），并已轮换会话密钥使旧会话失效。
- 生产冒烟：在运营后台创建 `139****0099` 测试账号，正式签名 V2.0.4 安装在模拟器并默认连接 `https://zhixi.seanyan.store`，在「设置 → 试用额度」成功激活并显示有效期与 0/1、0/5、0/1000、0/1 额度；后台立即显示该账号、1 台设备和脱敏请求记录。测试完成后已在后台删除该账号，删除后 App 刷新回到未激活状态。另用未激活设备请求 `/v1/analyze`，返回 403、`x-zhixi-error-code: account_required` 和中文激活指引；`/v1/accounts/me` 返回 `activated=false, required=true`。
- Lecsync 实际文本翻译成功返回中文结果；1 秒合成音频完成 `session.ready → usage.update → session.ended`。
- DeepSeek Flash、Kimi `k3.1-pro-highspeed`、MiMo `mimo-v2.6-flash` 均已分别生成真实学习包；Kimi 按接口要求使用 `temperature=1`。提供方字段别名、`sourceId/sourceIds` 和严格 schema 修复已验证。
- APP 设置页已显示正式域名在线；公网 WebSocket 云端课堂实际开始、收到实时文本并正常停止。R4 公网合成文本生成返回 HTTP 200；随后 APP 内再次真实生成并保存 **39 项学习内容和复习卡片**，完整通过 APP→网关→模型→Room 链路。
- 视觉能力已用真实模型探针和正式网关验证：MiMo `mimo-v2.6-pro` 与 DeepSeek `deepseek-flash` 均能读取合成图；正式 `/v2/learning-pack` 返回 200、`model=mimo-v2.6-pro` 和 1 条 `visualNotes`，模型正确读出 A/B 支座、中心 `F = 12 kN`、`L = 8 m`、`24 kN·m` 及公式，sourceId 为有效的 `qa-page-1`。R6 公网再次验证 MiMo 经一次修复仍结构无效时自动切换 `deepseek-flash` 并返回 200，证明跨视觉提供方回退生效。视觉端点复用现有 MiMo/DeepSeek 密钥，不新增 APP 密钥。
- 官网首页、功能、隐私与下载页已更新并发布 V2.0.4；公网 APK 完整下载后 SHA-256 与本地签名包一致。前代 APK、下载计数、网关健康及 `seanyan.store`、`www`、`api`、`quiz`、`hanshang`、`classroom`、`listen`、`token` 均保持 200。
- Lecsync 环境文件权限为 600，未进入源码、APK 或最终汇报。

## 本轮功能验收

- 首页 Dock 的开始/停止、标记疑问、暂停/继续均保留；暂停/继续图标增加缩放淡出过渡，底部拖动胶囊与橙色图标共用选中状态，静态胶囊不再二次折射图标。模拟器完成点击、拖动吸附和真实录音暂停/继续检查，停止后无后台录音。
- 学习页文案改为课程/讲义学习包，创建项目自由填写性质，不再显示三选项；性质进入 v2 纪要请求。
- 手动疑问支持零备注保存并显示确认，无课堂时明确提示。
- Lecsync 全功能网关已实现：文本翻译、同步/异步音频、Voice Typing HTTP/WebSocket、Realtime 全配置/事件、模型发现、录音下载/删除和 Webhook 管理。APK 只持匿名设备 token，无上游密钥。
- 云端听课设置改为分组开关与中文选项，热词/固定译法支持逐条添加、去重、移除与 50 条上限；进阶协议项折叠。新启动图标按自适应安全区居中，APP 顶栏、启动器、widget 与官网品牌标统一。
- 原文先落库再关联译文，AI 增强按 segment 替换；断线新流保留定稿且不盲目重发计费音频，8 秒恢复看门狗可切回本机 sherpa。设备测试已验证真实英文识别回退。
- 服务端校验 source hash、按设备隔离缓存与幂等键，限制速率/并发/字符/音频时长；Webhook secret 加密存储，管理接口不使用设备 token。
- 离线模型默认优先尝试自有国内镜像，网络异常时回退官方源；压缩包和全部 6 个安装文件均校验 SHA-256。三个公网镜像文件完整下载复验通过，模拟器连续完成三包下载、解压、校验和原子启用，设备端全部文件哈希一致。debug 保留模型用于回归；**release 已确认包含 0 个模型文件，50,470,298 字节**，需在设置中下载或恢复。
- 设置页支持运行时保存 AI 服务地址，学习包、文档和翻译共用；模拟器已实测后端在线/未配置模型状态，学习包旧 token 401 后自动注册重试，并准确显示后端 503，而非笼统“无连接”。
- 离线模型显示国内镜像/官方回退、包序号、实际字节/总字节、百分比、解压和校验阶段。实测 Zipformer 20.3 MB、Paraformer 74.3 MB 与 VAD 均完成下载；失败暂存会隔离，不覆盖旧模型。
- AI 学习包在结构修复失败后继续按 DeepSeek→Kimi→MiMo 回退；可靠原生文本 PDF 不再被无条件要求视觉 Provider，FastAPI 422 数组可显示具体原因。Markdown 导出成功提示在当前页面可见，系统选择器使用 `*/*` 保留 `.md`，已实际生成并核对导出文件，不再追加 `.txt`。
- V2.0.2 修复真机“生成学习包后闪退”：课程讲义与学习内容原先在同一 `LazyColumn` 使用各自裸数据库 ID，双方均为 `1` 时触发重复 key；现已改为 `material-*`、`learning-*`，课堂疑问与转写改为 `doubt-*`、`transcript-*`，并用相同 ID 场景的 JVM 回归测试及模拟器课程页打开验证。复杂视觉生成的前端读取等待放宽到 600 秒，并增加跨视觉提供方结构回退。
- V2.0.3 修复移动网络中的长请求 499：nginx 日志确认手机请求已到达服务端，但同步生成在模型返回前被客户端网络中断。正式网关改为 `POST /v2/learning-pack/jobs` 快速返回任务号，App 使用短连接轮询，网络短暂中断可重试；同设备同内容复用 active/15 分钟内成功任务，本地按 inputSha256 防止重复插入。验证：POST 202、轮询 succeeded、重复 POST 复用同 jobId；APP 内真实图片生成 29 项，二次生成提示“学习包已存在”；R8 增加 360 秒总超时，防止 provider 长时间无返回时任务永久 processing。
- 学习内容分类改版：课程页不再平铺全部学习条目，而是按“课堂纪要、我的疑问、重点与摘要、词汇、短语、自测问答、练习”生成分类卡片，显示数量与内容预览，点开二级页面查看带来源的具体条目；零条目分类不显示，未知历史类型归入末位“学习内容”。复习页改为分类总览（今日到期/卡片总数），进入分类后保留翻面、朗读和 FSRS 评分，并列出该分类全部卡片；“全部到期”可跨分类连续复习。模拟器以 13 项学习内容、9 张复习卡（5 张到期）验证分类顺序、二级页返回、翻面评分与到期数实时递减；Room 仅新增 JOIN 查询，无表结构或迁移变化。
- V2.0.4 试用额度与运营后台：新增 `access_accounts`、`account_devices`、`account_daily_usage`、`account_lecsync_usage`、`api_requests` 表；手机号用 HMAC 查找、Fernet 密文保存，App 本地仅存脱敏号码。新设备激活手机号后，AI 学习包、翻译、云端音频和文档解析按账号级每日额度结算，多设备共享；停用、到期、设备上限和额度耗尽均有可执行中文提示，离线听课不受影响。运营后台支持密码登录、新增/批量添加手机号、配置每日 AI 包/音频分钟/翻译字符/文档次数与有效期、禁用/解绑/删除账号，以及请求、学习包、音频、翻译、活跃设备、错误率、趋势、接口和模型分布统计。本地网关以 1 个账号、2 台设备验证激活、共享额度、管理后台新增/编辑/禁用/恢复、请求日志与手机号脱敏；运营后台在 Edge 无头浏览器逐页截图验收，控制台无错误。正式服务器部署与 V2.0.4 发布结果见下方。
- 官网文案同步：首页、功能页、问答页与下载页补充试用额度、分类学习与复习说明；把旧的“无需账号”口径改为“离线无需账号，AI/云端需激活额度”，问答页新增“为什么需要激活”和“一个手机号几台设备”两条；新增 `favicon.ico` 消除 404。公网页面已重新发布，并用 Edge 无头浏览器检查控制台无错误、试用说明和分类章节可见。
- 官网试用申请页：新增 `/#/apply`，填写姓名、昵称、手机号并完成 6 位短信验证码后自动创建账号；默认每天 5 个 AI 学习包、30 分钟云端音频、20000 翻译字符、5 次文档解析、最多 3 台设备，有效期按北京时间自然月 +2。验证码 5 分钟有效、最多错 5 次、同手机号 60 秒重发冷却，按手机号和 IP 限流；验证码只存 HMAC 摘要，手机号仍加密保存。FastAPI 用假短信发送器覆盖申请成功、错误码、过期、冷却、重复手机号、未配置短信和后台姓名/昵称展示。
- 阿里云号码认证（PNVS）短信认证已开通，系统赠送签名 `恒创联众`、登录/注册模板 `100001`；R13 服务端改用 `https://dypnsapi.aliyuncs.com/` 的 `SendSmsVerifyCode`，以服务端生成的具体 6 位码填入 `TemplateParam`，阿里云只负责发送，验证码仍由本站按 HMAC 摘要校验。真实短信已送达测试手机并由用户确认收到；独立临时库走通 `request-code` 200 → `apply` 201 → 运营后台显示昵称、姓名、5 个 AI 学习包、30 分钟音频、20000 字符、5 次文档、3 台设备和 +2 月有效期。生产环境测试手机已存在真实账号，`request-code` 正确返回 409，未删除或改写该账号。生产 `/api/trial/status` 返回 `smsConfigured=true`，申请页已自动启用；`ALIYUN_SMS_*` 只配置在服务器 `.env`（600）。
- Lecsync 官方指标对齐（2026-11-01）：提取官网开发者文档的 connect/消息/错误码/指标后完成四处对齐——①App 重连码集合补齐官方 retryable 清单（新增 4010/4011/4016，含 JVM 回归测试）；②暂停与停止时先发官方 `session.finalize` 再 `session.stop`，最后半句及其译文不再丢失（网关白名单本就透传，测试已覆盖）；③`usage.update` 的 `discardedSeconds` 随用量落库（Room 8→9 迁移 `ALTER TABLE cloud_tasks ADD COLUMN discardedSeconds REAL NOT NULL DEFAULT 0`，迁移测试验证新列与旧行默认 0）；④网关 4 小时边界改用官方 4012 关闭码（原 4408 仍被客户端兼容）。新增 `RealtimeLatencyTracker`：按"最新音频帧发出 → partial 到达"测首字延迟、"转录事件 → translation.partial"测翻译延迟（2 秒窗口、EMA 平滑、每 500ms 节流推送），实时课堂卡片右上角显示"首字 ~x.xxs · 译 ~x.xxs"，与官方 0.28s / +88ms 口径可比。官方指标表与测量口径已写入 `docs/LECSYNC_COMPATIBILITY.md`。真实公网课堂的延迟读数需在下次真实听课时从 App 内读取，本轮未消耗生产账号云端时长。
- Lecsync 显示与速度对齐（2026-11-01 第二轮）：以英文原文核实 `sentence` 模式忽略 `segmentation`（现有实现正确，无需改动）。新增双语实时显示——`transcript.partial.tailTranslation` 与 `translation.partial` 经新监听回调驱动 Dock"译 …"流式译文预览（定稿/停止/重连即清空）；纪要卡片按官方 `confirmed`/`status` 区分已确认与"整理中"（JVM 解析测试覆盖三种形态）；麦克风采集块 200ms → 100ms，直接降低首字延迟的采集分量；指标推送改为识别/翻译任一变化即发布（500ms 节流）。**模拟器 + 本地假网关（官方形状事件流）完成 UI 验收截图**：`首字/译` 指标行、正在识别+译 预览、speaker_0 定稿、纪要"整理中"标签同屏可见；停止录音时网关日志确认先 `session.finalize` 后 `session.stop`。设备 Realtime 测试补 `transcript.partial`/`translation.partial` 断言。
- R14 部署与真实使用场景验收（2026-11-01）：生产网关升级到 `/opt/zhixi-gateway-20261101-r14`（含官方 4012 关闭码与网页版服务端配套），systemd active，`/health`、`/api/trial/status`（`smsConfigured=true`）公网均 200。**真实语音延迟探针**（Windows TTS 生成 23.8 秒 16kHz 英语课堂语音，实时 100ms 分帧经 `wss://zhixi.seanyan.store/v2/lecsync/realtime` 推流）：首字延迟 **47ms**（官方口径平均 0.28s）、翻译流式首响中位 **77ms**（官方约 88ms）、识别延迟中位 438ms（77 个 partial），返回真实中文译文；首推遇到上游 `provider_connect_failed`（官方临时识别池问题，属官方 retryable 语义，重试即恢复）。**App 真实云端课堂**：模拟器切生产地址、绑定真实账号（199\*\*\*\*7931）后连续录音 114.4 秒，`session.ready → usage.update → 结束`，按账号结算 140.2 音频秒，App 额度卡实时显示"云端音频 2/60 分钟"，后台账号设备数正确。测试用探针设备的两条绑定已从 `account_devices` 精确移除（删前备份 DB），模拟器设备绑定保留；本轮真实上游音频消耗约 3.7 分钟（≈$0.02）。模拟器测试需临时设 `settings put global http_proxy 10.0.2.2:7890`（宿主 fake-ip DNS 会污染模拟器解析），测后已清除。
- 正式隐私政策包含本地/在线路径、提供方、凭据、保留删除、模型文件、第三方组件、未成年人及课堂授权；设置中有官网按钮。

## 真实验收边界

1. Lecsync 与 DeepSeek、Kimi、MiMo 已完成真实学习包联调；其余 Lecsync 能力主要完成 mock/协议验证，不能把全部高级能力都称为真实质量认证。视觉模型已启用并完成合成工程图真实验收；真实外教讲义中的手写推导、密集公式、扫描倾斜与超大版面仍应继续收集样本验收。
2. 自有国内镜像的三个官方包已连续完成 APP 内下载、提取、全文件校验与启用，公网镜像哈希也与官方一致；镜像篡改、断连回退和旧模型保留由 JVM fixture 覆盖。真实不同运营商的下载速度仍需真机网络长期观察。
3. 真实外教口音、长课续航、真机麦克风和模型成本未验收；视觉合成工程页已验收，不代表所有真实讲义版式都已达到同等识别质量。
4. MinerU/LibreOffice 仍为可插拔解析器，未配置时复杂页只保留原图并标待解析；DOCX/PPTX 需对应环境。
5. 正式 HTTPS 网关、运营后台、V2.0.4 签名包与官网下载页已完成；未准备参赛 PPT。

## 网页版一期（2026-11-01，本地验收）

- 新增 `webapp/`（React 19 + Vite 7 + TypeScript + Dexie + ts-fsrs）：云端听课转写/翻译、手动标记疑问、AI 学习包（异步任务+轮询+本地查重）、讲义导入、分类学习内容、FSRS 复习、账号激活与额度展示、Markdown 导出。本地数据只存浏览器 IndexedDB；构建 `tsc --noEmit && vite build` 通过，**14 项 vitest 通过**（分类映射、minutes 拼接、术语解析、复习分类汇总、FSRS 评分/遗忘/间隔、sourceHash 契约、错误提示映射）。
- 服务端配套（不影响 Android 端）：`/v2/lecsync/realtime` 与 `/v2/lecsync/voice-typing/ws` 允许浏览器以 `Sec-WebSocket-Protocol: bearer, <token>` 携带令牌（回显 `bearer` 子协议）；新增可选 `WEB_CORS_ORIGINS` 白名单（默认关闭，同源部署无需开启），错误响应暴露 `X-Zhixi-*` 头。**FastAPI 107 项 pytest 通过**（含 2 项子协议鉴权、2 项 CORS）。
- 本地端到端冒烟（uvicorn + vite preview + 内置浏览器）：设备注册、网关连接测试、手机号激活（脱敏号/有效期/四项额度展示）、课程创建（IndexedDB 持久化）、课程详情与复习页空状态、课堂页截图人工检查无控制台级布局问题；实时链路以真实 WebSocket 握手验证（直连网关与经代理均通过子协议鉴权、收到网关结构化 `session.error NOT_CONFIGURED`），未激活设备的 WS 握手拒绝路径也已验证。
- 验收边界：ZCode 内置浏览器不支持任何 WebSocket（公共回显服务同样失败），浏览器端实时转写的**真机/真实浏览器**验收待在正式 Chrome/Edge 或移动端完成；未验证真实模型质量、CORS 生产部署与多浏览器兼容。部署与发版仍由项目负责人执行。

## 网页版二期与生产部署（2026-11-01）

- 二期三个 PR 合并：#13 实时纪要（digest）+ PCM→WAV 本地存档 + 云端补转写（`/v2/lecsync/audio/jobs`，分段毫秒口径与 Android `LecsyncModels` 一致）；#14 CET6 词库导入（`GlossaryImporter` 逐条对齐，含 Kotlin/JS split 语义差异处理）；#15 浏览器离线识别（sherpa-onnx WASM v1.13.7 流式中英 Zipformer SIMD：模型管理器镜像下载+SHA-256 逐次复验+Cache API+镜像地址覆盖，官方 demo 同款解码循环，课堂设置云/离线切换，离线免额度）。**webapp 30 项 vitest 通过**。
- 生产部署（用户明确指令下执行）：网关 R14 由并行会话于 14:21 部署（`/opt/zhixi-gateway-20261101-r14`，含子协议鉴权与 CORS；`/health` 200、`providerConfigured=true`）；**网页版发布到 `https://zhixi.seanyan.store/web/`**（nginx `location /web/` alias `/opt/zhixi-webapp/current/`，同源直连 API/WS，无需 CORS；回滚=还原 `/root/zhixi-gateway-backup-*.conf` + 移除该 location）。
- 生产冒烟（临时账号 139****0998，验后即删）：设备注册 201 → 激活 200 → **经 nginx TLS 的 WSS 子协议握手升级 101 → `session.ready` → `session.stop` → `session.ended`** 全链路通过；`/web/` 与资源 200；激活/WS 用的设备 token 已随临时账号删除。
- 待办：离线识别镜像发布（上游 182MB 包在本机网络持续被截断，续传中；完成后按 `webapp/README.md` 上传 4 文件并登记 .wasm/.data 哈希）；真实浏览器（Chrome/Edge）人工验收；R14 中 PR #11 的 4012 关闭码随本次一并上线。

## 离线识别镜像发布与浏览器端到端（2026-11-01）

- 上游 182MB 包经断点续传下载完成，**SHA-256 与 GitHub 官方 digest 一致**（25e47ff0…）；4 个产物发布到镜像并登记哈希（PR #49，webapp r17 上线）。
- **发现并修复真 Bug**：镜像原在 shuike 域，webapp 在 zhixi 域，运行时 190MB fetch 会被 CORS 拦截——nginx 在网关域加同源 alias（`/models/zhixi/web/` → 同磁盘目录），`DEFAULT_MODEL_BASE_URL` 改指同源地址并加回归测试锁定（PR #50，r18）。
- **浏览器内联端到端通过**（生产 origin，绕过 IAB 麦克风限制直测引擎管线）：同源 fetch 4 产物（.data 189.8MB/472s）→ SHA-256 逐文件校验通过 → blob URL 注入 → WASM runtime 初始化 → `createOnlineRecognizer` 创建成功 → 解码循环 5 步、`getResult` 正常返回、`reset` 正常。离线识别除麦克风采集（浏览器标准能力，IAB 环境拒绝无法自动化）外全链路真实可用。
- 现状：网页版离线模式完全激活——首次使用自动从同源镜像下载约 200MB（带进度与哈希校验，Cache API 持久化），之后免额度本地识别；云端模式与官网引导不受影响。

## 产物

- Debug：`app/build/outputs/apk/debug/app-debug.apk`
- V2.0.4 签名 Release：桌面 `知习-V2.0.4.apk`，`versionName=2.0.4`、`versionCode=6`，v3 签名验证通过；大小 **50,535,834 字节**，SHA-256：`C908BDC68B0F17238B9D05381A2E94B04425C61A3EE21654E755FAD8F184ED92`。
- 官网下载：`https://shuike.seanyan.store/#/download`，公网 V2.0.4 APK 已完整下载并核对为同一 SHA-256；官网首页、下载页与隐私页已更新。
- 运营后台：`https://zhixi.seanyan.store/admin/`，管理员密码只保存在服务器 `/opt/zhixi-gateway/.env`（600），不写入仓库、APK 或前端 bundle。
- Release 默认网关为 `https://zhixi.seanyan.store`，不包含模型权重或 API 密钥；离线模型首次使用前需下载或恢复。
