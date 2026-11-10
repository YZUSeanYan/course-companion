# 知习 · 本地验收记录

初始验收日期：2026-10-31 至 2026-11-01。范围包括本地模拟器、设备仪器测试、本机 FastAPI、mock 模型，以及正式 HTTPS 网关的小额合成内容联调；不包含全部真实模型与完整生产质量认证。

本文件按日期保留历史记录。早期章节中的“当前运行”“已上线”和测试数量只代表当次验收；最新状态见 [2026-11-11 上线进度](#2026-11-11-上线进度)。同日部署前快照仍保留，不能把历史“未部署”当成最新状态，也不能把源码/CI 或部署完成等同于真实课堂验收通过。

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
- R14 部署与真实使用场景验收（2026-11-01）：生产网关升级到 `/opt/zhixi-gateway-20261101-r14`（含官方 4012 关闭码与网页版服务端配套），systemd active，`/health`、`/api/trial/status`（`smsConfigured=true`）公网均 200。**真实语音延迟探针**（Windows TTS 生成 23.8 秒 16kHz 英语课堂语音，实时 100ms 分帧经 `wss://zhixi.seanyan.store/v2/lecsync/realtime` 推流）：首字延迟 **47ms**（官方口径平均 0.28s）、翻译流式首响中位 **77ms**（官方约 88ms）、识别延迟中位 438ms（77 个 partial），返回真实中文译文；首推遇到上游 `provider_connect_failed`（官方临时识别池问题，属官方 retryable 语义，重试即恢复）。**App 真实云端课堂**：模拟器切生产地址、绑定测试账号（手机号已脱敏）后连续录音 114.4 秒，`session.ready → usage.update → 结束`，按账号结算 140.2 音频秒，App 额度卡实时显示"云端音频 2/60 分钟"，后台账号设备数正确。测试用探针设备的两条绑定已从 `account_devices` 精确移除（删前备份 DB），模拟器设备绑定保留；本轮真实上游音频消耗约 3.7 分钟（≈$0.02）。模拟器测试需临时设 `settings put global http_proxy 10.0.2.2:7890`（宿主 fake-ip DNS 会污染模拟器解析），测后已清除。
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

## 白屏热修与账号体系升级（2026-11-01）

- **白屏根因与修复**（PR #54，r19）：课堂页 `where('targetLang')` 与译文队列 `where('status')` 查询了 Dexie 未索引字段，SchemaError 在 useLiveQuery 渲染期抛出并卸载整棵 React 树（授予录音权限后立刻白屏）。线上 origin 用假麦克风流复现 → Dexie 升 v2 补索引 → 回归测试覆盖全部 where 字段 → 线上复测进入「听课中」、停止优雅结束、额度耗尽提示路径同时验证。
- **账号体系升级**（子代理并行实现 + 集成，PR #55/#56/#57，网关 R15 + webapp r20）：
  - 激活需验证码：`POST /v1/accounts/activate/request-code`（PNVS 发送、HMAC 摘要存 activation_codes、60s 冷却/TTL 5 分钟/错 5 次/三层限流）；activate 支持可选 code，`REQUIRE_ACTIVATION_CODE=true` 时缺码 403 activation_code_required（生产已开启）。
  - 云空间同步：`/v1/sync/push` + `/v1/sync/pull`（8 类实体、账号级 last-write-wins、墓碑删除、单批 ≤500、payload ≤128KB、UUID 白名单），新表 sync_records；webapp 端 8 张表加 uid（Dexie v3）、设置页「云空间同步」卡、激活后与生成学习包后自动同步。
  - 测试：服务端 **135 pytest**（基线 111 + 激活码 15 + 同步 9）；网页端 **59 vitest**（uid 生命周期 + 同步客户端 + 索引回归）。
- **生产 E2E 全通过**（临时账号 139\*\*\*\*0996，验后即删）：缺码激活 403 activation_code_required → 服务端按 request-code 同一存储原语 mint 码 → 带码激活 200 activated → 同步 push 3 条全 accepted → pull 读回一致 → LWW 改名生效 → 墓碑删除标记正确。
- 兼容性说明：`REQUIRE_ACTIVATION_CODE=true` 后，**未升级的 Android 客户端激活会收到 403 + 中文提示**（需要验证码），需 Android 端跟进支持；网页版与官网申请流程不受影响。

## 「几秒后自动结束」排查与自动重连加固（2026-11-01）

- 现象：手机端（小米浏览器）云端课堂稳定在 4–5 秒断开自动结束。排查：nginx/网关日志无异常；`lecsync_tasks` 显示上游当时以 succeeded 正常结束（0.5 秒内 updated）；上游带音频探针 48 秒完全健康（ready/partial/usage 流正常）；R15 上带帧拦截的浏览器复现 20 秒+ 无任何异常。**判定为上游瞬时故障，现已无法复现。**
- 加固（PR #59，r21）：云课堂意外断线**自动重连**——非用户停止、非致命关闭码（4401 鉴权/4403 额度/4429 限流/4408 时长）、未达 3 次上限即重试（1s/2s/4s 退避）；同一课堂记录与已定稿行保留；代际计数器防止过期重连污染新课；stop() 禁用重连。65 项 vitest。
- 补充（PR #60，r22）：`session.error retryable=false`（额度耗尽等）标记为 fatal，**立即停止重连**并展示原因，避免无效重试期间继续推流计费。
- **线上验证**（假麦克风流）：课堂运行中强制断开 socket（1005）→ 自动重连出新连接 → 课堂继续「听课中」、React 树完好。

## V2.0.5 两步验证码激活 + 启动公告 + 标语远控（2026-11-01）

- **服务端 R16（PR #64）**：新增 `app_config` 表（单 JSON 文档，`get/set_app_config`）；`GET /v1/app-config`（设备 token 鉴权，未激活设备可读）返回公告 + 标语 + updatedAt；管理 `GET/PATCH /admin/api/app-config`（session + CSRF，标语逐条 strip、≤8 条 ×40 字，空标题空正文强制 `enabled=false` 防误开）。8 项新 pytest，**143 项全绿**。部署 `/opt/zhixi-gateway-20261102-r16`（R15 保留回滚），`/health` 200。
- **管理后台**：新增「公告与标语」页（启用开关 / 标题 ≤80 / 正文 ≤2000 / 标语逐行编辑含实时计数与前端 8×40 预校验），构建产物已更新 `/opt/zhixi-gateway/admin-dist`（旧包备份）。
- **Android V2.0.5（versionCode 7）**：
  - 激活卡片对齐网页版两步流：手机号 →「获取验证码」（服务端 `cooldownSeconds` 驱动倒计时）→ 6 位验证码 →「激活试用额度」+ 重新发送 / 更换手机号；手机号知情弹窗移至发送验证码一步触发；错误映射补 `activation_code_required` 与 HTTP 400 中文 detail 透传（验证码错误剩余次数等直达 UI）。
  - 每次冷启动拉取 `/v1/app-config`：公告 enabled 且有正文时以「首次使用提示」同款玻璃弹窗弹出（`GlassConfirmDialog` 新增可空 dismissLabel，公告为单「我知道了」按钮；与首次提示同屏时排队其后）；首页轮播标语改为远控列表（5s 轮播与 AnimatedContent 不变），空配置/离线回退内置「知行合一 / 学而时习之，不亦说乎」。
- **模拟器 E2E（假网关扩展 request-code/activate/app-config 三端点，验证码打到控制台）**：冷启动 → 公告弹窗（标题/正文/单按钮）→ 关闭后首页标语在远控 3 条间轮播；设置 → 更换手机号 → 输入手机号 → 获取验证码（POST 200）→ 第二步出现验证码输入 → 输码 → 激活 POST 200 → 卡片回已激活态。**E2E 发现并修复 2 个真 bug**：① `AppConfigDto` 缺 `updatedAt` 字段，严格 JSON 解码把整个响应判为 malformed，公告与标语静默失效；② `codeSent` 从未置 true，第二步 UI 永不出现（改为进入冷却即推进、激活成功回退）。
- **回归**：89 项 JVM（+3：验证码响应解码、activate 请求 code 省略/携带序列化、app-config DTO 解码）、25 项设备测试、lint 全绿。
- **生产冒烟**：`/health`、`/admin/`、`/v1/app-config` 默认空配置 200；管理 API 真实保存「知习 V2.0.5 上线」公告 + 3 条标语后，公网设备 token 读回一致；`request-code` 对未注册号返回 404（未发真实短信）。
- **发版**：签名包 `知习-V2.0.5.apk`，50,552,218 字节，SHA-256 `6E5C4710D13EC222255ABDD565E57112BA87805CF51202A4499139C1FD4976BC`，证书与 V2.0.4 一致（CN=Zhixi）；已上传 `/opt/shuike-site/downloads/`，官网 release.ts 升 2.0.5（PR #65）并 overlay 发布，公网下载与页面 2.0.5/SHA-256 引用核对通过。

## 网页版自助开通与官网重做（2026-11-02，r23 / 网关 r17）

- **问题**：网页版导入讲义后，新注册用户被提示「请先更新到最新版知习，并在 设置 → 试用额度 中激活手机号」——文案写死 App 语境，且网页版没有自助开卡路径（`/v1/accounts/activate/request-code` 对未开卡手机号直接 404），iOS 用户因此无法独立使用。
- **服务端（网关 r17，PR #66）**：`/v1/trial/apply` 接受可选 `Authorization` 设备令牌，短信验证通过后直接用同一账号绑定当前设备并返回 `deviceBound`，浏览器一次短信完成「申请 + 激活」；新增 `optional_device_identity`，令牌失效时按匿名调用放行，避免已消费验证码的申请整笔失败；`account_required` / `account_not_found` / `phone_registered` 文案去掉 App 专属指向与「更新到最新版」。
- **网页版（r23）**：设置页「试用额度」改为申请/激活一体——先探测是否已开卡，`account_not_found` 时自动切到自助申请（昵称必填、姓名可选、同意条款），开卡后立刻刷新额度；讲义导入、学习包生成、云端听课失败改用 `userMessage` 并给出「去激活试用额度 →」入口。
- **官网（/opt/shuike-site）**：重写设计系统并统一六个页面（PageHero / SectionHead / CtaBand 共享组件、统一字号刻度与分区留白、卡片/按钮/键值表）。修复深色分区标题不可见（`.display` 的 `-webkit-text-fill-color: transparent` 覆盖了 `color:#fff`）、750/650 非标准字重、中文负字距与伪粗体、中文标签套大写宽字距等字体问题；申请页改两栏、反馈页改三卡 + 双列问答、隐私页加目录侧栏。四张 App 截图重新从模拟器抓取（原先「间隔复习」误抓为系统启动器、「实时听课」为待机页）。
- **验证**：server 144 项通过（`test_lecsync_admin` 仅因本机缺 `mutagen` 失败，该依赖已在 `requirements.txt`）；webapp `tsc` + 69 项 vitest；site `tsc` + build；桌面 1440 逐页渲染核对，390 宽无横向溢出。
- **线上核对**：`zhixi.seanyan.store/v1/accounts/me`（新设备）返回 `activated:false`；`/v2/learning-pack/jobs` 与 `/v2/documents/analyze` 对未激活设备返回 `需要先激活试用额度：在「设置 → 试用额度」用手机号激活即可`（403，不再提 App）；`shuike.seanyan.store` 已切到新 bundle，`screenshots/app-live-class.png` 200（356,786 字节），`downloads/` 373M 与 `models/` 298M 未受影响。
- **未做真机短信验证**：`/v1/trial/request-code` 会真实发短信，本轮只用已注册设备覆盖了 404/403/422 分支，未向任何手机号发送验证码。

## 官网艺术化重做：纸与声（2026-11-02，PR #70）

- **目标**：上一轮解决了「风格统一」，但页面仍是干净模板，缺少美术表达与动效语言。本轮在**不改主题色 `#ff670d`** 的前提下加一层艺术处理，并把全站动效收敛为一条语法。
- **视觉层**：全站极淡纸纹（SVG `feTurbulence`，`multiply` 混合、不拦截指针）；首屏两团缓慢漂移的暖光（径向渐变 + `transform`，刻意不用 `filter: blur` 以免整页重绘）；分区标题改为「大号描边编号 + 眉毛标签」同基线的编辑式脚标；页脚收描边大字 `ZHIXI`，列表链接改细下划线生长；行动区底部压三条同一振幅包络的声波线。
- **动效层**：统一曲线 `--ease-out = cubic-bezier(0.16, 1, 0.3, 1)`，元素只「升起并停稳」，不做回弹。新增 `Reveal` 的 `mask`（遮罩揭开）与 `scale`（放大落定）变体、顶部 2px 阅读进度线、实测数字计数、深色分区指针聚光（仅 `hover: hover` 精细指针）、卡片光扫、原则行下划线、慢速词汇丝带（悬停暂停）。
- **过程中修掉的三个真实缺陷**：
  1. `clip-path` 加在被 `IntersectionObserver` 观察的元素自身时，浏览器算出 0 交叉比、动画永不触发，首屏标题会整块消失。改为遮罩放内层、外层保持正常几何，并对首屏元素在挂载后直接播放。
  2. `requestAnimationFrame` 在后台标签页/低电量模式下被节流，计数可能停在 0。初值改为目标值，仅确认元素在视口内才从 0 开始，并加定时器兜底。
  3. `kimi-plugin-inspect-react` 一直在生产包里，给每个元素加 `code-path` 并注入悬浮头像。改为仅 `vite serve` 启用，生产 JS 364.85 KB → 328.36 KB。
- **无障碍**：`prefers-reduced-motion: reduce` 下极光、丝带、扫描线静止；`reveal-mask-inner` 一并还原（只还原外层仍会把标题裁掉）；逐页复核隐藏元素数为 0。
- **验证**：`tsc` + `npm run build` 通过；`npx eslint src` 对改动文件零问题（剩余 8 条来自既有 `components/ui/*` 模板）。真实浏览器（CDP）在 390 / 768 / 1440 三档宽度下逐页测量：六页均无横向溢出（`scrollWidth == clientWidth`），`reveal` 元素全部落地，`h1` 均可见。
- **发布**：tar overlay 到 `/opt/shuike-site`（发布前备份 `index.html.bak-20261102-023235`，未使用 `--delete`）。线上 `index.html` 已指向 `index-BRb99OMG.js` / `index-DBlDJXUL.css`；公网复测首页与六个路由渲染正常，`downloads/` 373M、`models/` 298M 与全部 APK 未受影响，`zhixi.seanyan.store/health` 与 `/web/` 均 200。
- **边界**：本轮只改视觉与动效，未改任何文案、链接与产品行为；未做 iPhone Safari 真机目视验收；Mimosa 深度安全审计仍未完成，不得据此声称项目通过安全审计。

## V2.0.6 图标 / 设置三板块 / 离线模式 / 暂停与译文修复（2026-11-02）

- **图标**：新 Z + 声波自适应图标（前景 PNG mdpi–xxxhdpi、桃色渐变背景、简化 Z 单色层、白 Z 通知图标、桃色圆角方品牌标用于首页头部与桌面小组件）。
- **设置页三板块**：「我的」（账号与额度 + AI 服务连接）/「课堂与翻译」（含「离线模式」卡：说明 + 强制离线录音 / 断网自动转录 / 极速启动三开关 + 可展开的离线模型管理）/「使用与隐私」（橙色置底：保存原始录音、自动同步、隐私说明、隐私政策、电池与通知、版本与官网）。
- **离线模式行为**：强制离线录音全程本机、不发云端；断网自动转录开关关闭后不再静默回退；极速启动双引擎（本地预览先行 + 云端就绪回放切换，8s 未就绪本地转正并落库缓冲终稿）；自动云同步在同课堂原地替换本地转写（`/v2/lecsync/audio/jobs` 分页结果），配额/网络失败进 pending 队列并在下次启动重试。
- **暂停修复**：引擎级 paused 语义——暂停期间服务端 4013 空闲关闭不再触发重连循环、错误横幅或强制停止（4012/4013 使用专属文案），恢复时自动重建连接并回放缓冲；实测暂停 16 秒跨过假网关 12s 空闲关闭，界面保持「已暂停」、计时冻结、零横幅，恢复后新建 WS 续录。
- **译文修复**：仪表盘与详情页译文订阅改为 `flatMapLatest`（此前嵌套 collect 冻结首批行 ID，后续行译文永不出现）；转录 segment→stream 映射修复重连轮转后 translation.final 丢失；云端回退本机后逐行仍走本地翻译。实测定稿行下直接显示中文译文。
- **首页收窄**：录音中/暂停时课程关联卡与状态卡变单行紧凑卡，转写视口升至屏高 48%（320–560dp）。
- **课程卡片**：长按菜单（重命名/编辑、删除、取消）；重命名写入 DAO，删除事务内把 `sessions.courseId` 置空后级联删除课程内容；模拟器实测改名落库与删除后课程 0、课堂记录保留。
- **模型损坏防护（E2E 实测发现）**：历史中断下载留下的截断 `model.int8.onnx` 会让 sherpa-native 直接 abort 进程；新增 `.verified` 标记 + 一次哈希迁移，损坏目录 `canRecognize=false`，录音入口给出「离线模型不可用或已损坏，请重新下载」并安全退出；`finishRecordingAfterFinalPass` 容忍已关闭的持久化线程池（修复拒绝路径上的 RejectedExecutionException 崩溃）。
- **学习包质量（网关 R17）**：prompt v3 按学科/语言类型适配（工科=术语表、短语≤5），显式预算（词汇 12/短语 6/要点 12/问答 8/卡片 10）与反重复规则；`_dedupe_and_cap` 后处理去重跨词汇/短语并截断。**147 项 pytest** 通过（+4 质量测试）。
- **回归**：89 JVM、25 设备、lint 全绿；模拟器 E2E 覆盖三板块、离线卡、暂停/恢复、译文、收窄、课程长按、强制离线无 WS、自动同步原地替换（含 pending 重试补同步历史课堂）。

## 网页版 UI 重做：桌面工作台（2026-11-02，未部署）

- **问题**：网页版一期的 UI 是把 Android 移动端直接照搬过来的——固定底部导航、单列 `max-width: 860px`、所有内容挤成一摞玻璃卡。桌面浏览器上表现为「手机界面被放大」，横向空间浪费、信息密度低、没有键盘操作。Android 端本身在 `≥600dp` 就把底部导航换成了侧边玻璃导航轨（`MainActivity.kt:1343-1400`），网页端把这一层适配整个丢掉了。
- **设计方向**：保留品牌（暖橙、玻璃、纸面），重建信息层级——桌面是「左侧导航栏 + 顶栏 + 多栏工作区」，层级按 CSS 只做一次：`<640px` 底部玻璃导航（手机形态）、`640–1023px` 图标轨、`≥1024px` 完整左栏、`≥1180px` 主区 + 360px 侧栏。
- **设计令牌**：品牌色对齐 App 的 `#FF670D / #E04E00 / #FFF1E8`（原先是 Tailwind 的 `#f97316`，与官网和 App 都不是同一个橙）；圆角、文字灰阶、状态色、动效曲线（`cubic-bezier(0.05,0.7,0.1,1)`，与 Android `PageDecelerate` 同源）全部收进 `:root`。
- **逐页**：听课页改为「计时台 + 独立滚动的转写流」主区 + 右侧「回看 / 纪要 / 课堂设置 / 额度」侧栏；学习页课程列表改卡片网格并拆出独立新建表单；课程详情左内容右讲义；复习台加键盘操作（空格翻面、1–4 评分）、进度条与卡片统计；设置页左状态右配置。
- **按调研修掉的产品不一致**（Android 端调研报告 `app-survey`，35 屏、3.6 万字）：
  1. 网页版**无条件**把整节课 PCM 编码成 WAV 存进 IndexedDB（`classroom.ts:363-374`），而隐私页写的是「录音（如开启存档）」。改为 `saveAudio` 默认 false，课堂设置里给显式开关，关闭时不落音频。
  2. 复习评分档位与 App 不一致：网页是「忘了/困难/良好/简单」，App 是「不认识/模糊/认识/很简单」。已对齐，并按窄屏改 2×2 排布。
  3. 长课时转写全量渲染。改为默认窗口最近 60 行（可展开全部），并在用户上翻时停止自动吸底、给出「回到最新」。
- **修掉的 CSS 缺陷**：窄屏 `.quota-grid { 2 列 }` 覆盖写在了 `.quota-grid` 定义之前，被后者的 `auto-fill` 规则盖掉，手机上配额排出 3+1 的残缺行。已移到文件末尾的 639px 断点。
- **子代理复核后又修掉的 11 处缺陷**（DeepSeek Study 三路审读，我逐条复核后确认并修复）：
  1. `#/learning/course/abc` 这类非法 id 会得到 `NaN`，Dexie 的 `IDBKeyRange.only(NaN)` 抛 `DataError`，`useLiveQuery` 在渲染期抛出把整棵树卸载成白屏。改为非法 id 映射到 `-1`，落到既有「课程不存在」兜底。
  2. 实时翻译把 `targetLang = "zh"` 落库，而展示侧按 `"zh-CN"` 查找、补翻队列又按 `"zh-CN"` 去重——译文**永远不显示**，且结束时会为已翻译的行重复排队、重复扣额度。查询改为不限定语种、展示侧两个代号都试，队列去重改为按 `transcriptLineId`。
  3. 复习键盘评分：无 `event.repeat` 防护，长按数字键会给同一张卡评多次（后一次覆盖前一次、写入重复日志）；按钮点完后卸载导致焦点落到 `body`，`keydown` 从此失效。改为 window 级监听 + `event.repeat` 跳过 + 评分 in-flight 锁，并把 BUTTON 排除在外以保留原生 Enter 激活。
  4. 图标轨形态（640–1023px）下品牌链接失去可访问名称（`rail__name` 被 `display:none`、图标 `aria-hidden`），补 `aria-label`。
  5. `useMotto` 挂在 Shell 上，每 5 秒让整个外壳与页面子树重渲染；且该状态只在首页被消费。下沉为只在首页挂载的 `<MottoText />`。
  6. 路由切换只做了滚动复位，注释声称的「焦点复位」未实现；返回按钮卸载后焦点掉回 `body`。补焦点转移。
  7. `.cols__main` 在 CSS 中根本不存在（四个页面都在用），缺 `min-width: 0` 时主栏遇到长 URL 会撑破轨道。补齐。
  8. 侧栏卡片间距在 ≥1180px 与 ≤767px 下因 `gap` 与 `margin-bottom` 叠加变成 32px，与主栏 16px 不一致。侧栏内卡片 margin 清零。
  9. `.live-line__wave` 用 `height` 做无限动画，逐帧强制重排；改为 `transform: scaleY()`。
  10. 「保存原始录音」在课堂进行中仍可切换，但控制器只在 `start()` 时捕获该值，切换不生效也无提示。改为进行中禁用并注明「本次课堂按开始时的设置执行」；同时默认关闭时不再累积 PCM 帧（约 115KB/s）。
  11. 程序化聚焦给 `.page` / `.review-stage` 套上整块橙色焦点框，观感像布局 bug；两处 `:focus` 轮廓显式去掉（它们不是可交互控件）。
- **发布前又修的两处**：
  1. **复习队列跳卡**：`dueCards` 直接来自实时查询，评分把本卡 `dueAt` 推到未来后列表立刻少一张，而 index 同时 +1——两下一叠加就跳过下一张（`第 2/3 张` 瞬间变 `第 2/2 张`，中间那张永远不出现）。改为进入会话时快照队列，并给组件加 `key={type}` 让切换分类能重建。
  2. **课程详情加载态误报**：`useLiveQuery` 未给默认值，`undefined` 同时代表「还在查」与「确实不存在」，每次进页面都先闪一下「课程不存在」。默认值改 `null` 区分两态。
- **发布前又补的回归测试**：`translate-queue.test.ts`（5 项，锁住 `zh`/`zh-CN` 口径与去重）、`review-queue.test.ts`（4 项，锁住快照推进不跳卡）。
- **验证**：`tsc --noEmit` 通过；`vitest run` 78 项通过（12 文件）；`vite build` 通过。CDP 真实浏览器逐项实测：七个路由全部正常渲染且零未捕获错误；`#/learning/course/abc` 与 `999999` 均落到「课程不存在」兜底（不再白屏）；详情页加载态不再闪现误报；`saveAudio` 默认 `false` 且开关可持久化；复习三张卡依次 alpha→beta→gamma 无跳过、写 3 条日志、进入完成态；键盘长按 5 次只记 1 条日志；点按钮后键盘仍可用；译文 `targetLang="zh"` 的行能正确显示中文。390 / 820 / 1440 三档无横向溢出。
- **图标**：品牌标与站点图标改用 App 最新启动图标 `app/src/main/res/drawable-nodpi/ic_brand_square.png`（512×512，Z + 声波）。资源放在 `webapp/src/assets/`，由 Vite 生成带哈希的 URL；因为 `base: './'` 且产物挂在 `/web/` 子路径，favicon 与 `apple-touch-icon` 在运行时由 `main.tsx` 用该 URL 注入，写死在 `index.html` 里会在子路径下 404。
- **发布**：网页版发布到 `/opt/zhixi-webapp/r24`，`current` 软链从 `r23` 切到 `r24`（`r23` 保留回滚）。公网 `/web/` 200、`index-DeIYitxV.js` 482,235 字节、`index-DkPgPdZU.css` 20,876 字节、`app-icon-DnJRG8jj.png` 72,614 字节均 200；`zhixi.seanyan.store/health` 200。**回滚 = `ln -sfn /opt/zhixi-webapp/r23 /opt/zhixi-webapp/current`**。线上实机核对：桌面 1440 左栏宽 244、底栏 `display:none`；手机 390 左栏隐藏、底栏 `display:grid`；两档均 `scrollWidth === clientWidth`；品牌标与 favicon 均指向 `app-icon-DnJRG8jj.png` 且 `naturalWidth=512`。
- **边界**：本轮只改 UI 与上述三处产品行为修正，未改接口、同步协议与额度逻辑；课程详情与复习会话未做端到端真实数据流程验收（本地无生产账号）；Mimosa 深度安全审计仍未完成，不得据此声称项目通过安全审计。

## 运营后台账号化与历史数据清理（2026-11-02，网关 r18）

- **问题**：后台「设备」页把 53 台注册设备全部平铺，其中 52 台是调试期未激活的匿名设备；1176 条调用记录里 897 条没有账号归属，绝大多数是测试设备轮询。设备与账号、调用与账号之间没有形成可读的归属关系。
- **服务端（R18）**：`recent_api_requests` 支持按账号筛选，默认只返回已归属账号的记录并隐藏 `/v1/accounts/me`、`/v1/trial/status`、`/v1/app-config`、学习包任务进度四类轮询；指标中间件在请求结束后回查一次设备绑定，把「申请试用时刚建立绑定」的调用也归档到账号。账号列表新增绑定设备明细、最近活跃、近 7 天调用/失败数；设备列表默认只列匿名设备，并新增单个/批量清理接口；启动时执行保留策略（匿名设备 7 天、调用记录 90 天、验证码 7 天、孤儿同步记录）。
- **管理后台**：移除独立「设备」页，导航改为「账号与设备 / 调用记录」；设备在账号行内展开查看与单独解绑，未绑定设备作为账号页底部的独立清理区；调用记录页按账号展示，支持账号筛选、只看失败、包含轮询、显示未绑定设备与清理全部记录。
- **一次性清理（先 `sqlite3.backup` 到 `learning.db.bak-r18-20261102-044249`）**：删除 52 台匿名设备及其 642 条调用、35 条云端任务、17 条日用量、5 个学习包任务、16 条分析记录；再清空剩余 644 条调用、2 条短信码、14 条激活码与孤儿同步记录。保留 2 个账号、1 台已绑定设备，以及该账号的同步记录（清理时 84 条）、学习包与音频任务。
- **验证**：server 149 项 pytest 全绿（本机补装 `mutagen` 后含 `test_lecsync_admin`）；admin `tsc --noEmit` + `vite build` 通过；本地预览浏览器核对账号展开、匿名设备区、按账号调用记录与筛选；线上 `accounts` 返回 2 个账号 / 1 台设备，`devices?scope=all` 为 1 绑定 + 0 匿名，`requests` 为 0，概览「绑定设备 1 / 匿名 0」。
- **回滚**：服务单元备份 `/etc/systemd/system/zhixi-gateway.service.bak-r17`，R17 目录保留；后台旧包 `admin-dist.bak-r18-20261102-044249`；数据库备份同目录。Mimosa 深度审计未完成，不得据此声称通过安全审计。

## 网页版听课录不到内容（2026-11-02，r25 已发布）

- **现象**：用户反馈「网页版好像录不上音」。
- **定位**：麦克风采集本身正常（`getUserMedia` 拿到音轨、AudioWorklet 有帧产出、整链无报错）。根因在重采样：`PcmDownsampler` 每输入一个采样就输出一个，与 `ratio` 无关——`lerpPos` 累加后被 while 循环减回 0，但 push 无条件执行一次。48kHz 下等于每秒产出 48000 个样本却按 16kHz 打标，网关按 `len(audio)/32000` 计时（`lecsync_routes.py:474`）并转给上游 ASR，于是音频被当成 3 倍慢放播放、识别基本出不来，额度还按 3 倍扣（10 分钟的课记成约 30 分钟，14400 秒上限会在 80 分钟真实时长时提前触发）。该缺陷自网页版一期（PR #12）就存在，不是 UI 重做引入的。
- **实测**：无头 Edge + 合成麦克风（`--use-fake-device-for-media-stream`）。修复前 1.61 秒真实时间产出 4.6 秒音频（speedRatio 2.86）；修复后网关侧 31,218 B/s 对期望 32,000 B/s（speedRatio 0.975，差额是缓冲里未凑满一帧的 0.2 秒）。
- **修法**：累加器每越过一次 `ratio` 才输出一个样本，并在 `prev→sample` 之间线性插值。中途一度改成 `${PcmDownsampler.toString()}` 拼接 worklet，构建后类名被压成 `cS` 而字符串里手写的 `new PcmDownsampler(...)` 不会被重命名，线上会 `ReferenceError` 使录音彻底失效（开发模式反而正常）——已改回纯字符串常量并检查产物。
- **测试**：新增 `pcm-resample.test.ts`，用 `new Function` 注入 `AudioWorkletProcessor`/`registerProcessor`/`sampleRate` 直接执行 `WORKLET_SOURCE` 本身，覆盖 48k/44.1k/16k 输出时长一致性、帧长、静音、440Hz 过零率、Int16 夹取、暂停不产出、空输入。
- **端到端**：本地假网关（FastAPI，仅回环）+ 合成麦克风，dev 与 prod 构建各跑一遍——开始听课 → `session.ready` → 8.4 秒音频 / 8.61 秒墙钟、42 帧、页面零错误；暂停 4 秒期间字节增长 0，恢复后 3 秒补 3.0 秒音频。
- **检查**：`tsc` 通过、vitest 88 项通过（13 文件）、`vite build` 通过。
- **发布**：网页版发布到 `/opt/zhixi-webapp/r25`，`current` 从 `r24` 切到 `r25`（`r23`/`r24` 保留）。公网 `index-CjI9Zx__.js`（482,570 字节）与本地验证产物 SHA-256 完全一致；线上包内 worklet 源码实测 5 秒 48kHz 输入产出 4.8 秒音频、零错误。**回滚 = `ln -sfn /opt/zhixi-webapp/r24 /opt/zhixi-webapp/current`**。
- **边界**：未改协议与网关；停止时缓冲中不足一帧（≤0.2 秒）的音频不 flush，属可接受损失。Mimosa 深度审计仍未完成，不得据此声称通过安全审计。

## 官网下架自助申请试用页（2026-11-02，已发布）

- **前提核实**：下架前先确认两端都能自己开通试用额度。网页版「设置 → 试用额度」在手机号未开通时自动转自助申请（姓名/昵称/同意条款 → 6 位验证码 → 开卡并绑定当前浏览器）；App 自 **V2.0.6** 起同样支持（`LearningPresenter.requestCode` 捕获 `account_not_found` 后切 trial 模式，界面出现姓名/昵称与「开通并激活」）。线上核对：`POST /v1/trial/request-code` 对非法手机号返回 422（路由开放、无需设备令牌）、`/v1/trial/status` 返回 `smsConfigured=true`；线上分发的 APK 为 V2.0.7。
- **改动**：删除 `site/src/pages/Apply.tsx` 与 `/apply` 路由、导航项、页脚两处入口；Home/Download 中指向 `/apply` 的链接改为「打开网页版」「下载 App」；Download 的额度说明改写为「App 与网页版都能自己开通」并补一条通往隐私政策额度章节的链接；Privacy 删除「或在官网申请页…」表述（其余隐私承诺原样保留）；README 两处说明同步改写。已删除的 `/#/apply` 落到首页兜底路由。
- **顺带修正版本号漂移**：线上官网本来就是 V2.0.7，而 main 源码 `release.ts` 仍是 2.0.6（并行会话改完部署后未把版本号提交回仓库）。本次一并升到 2.0.7，SHA-256 `2d5121e22216a612193dabe6589d672c7d44985eb05662f3eb002fb20fdb2035` 与服务器 `/downloads/zhixi-v2.0.7.apk` 实测一致，Gitee 直链 HEAD 200。**若不做这一步，从 main 重新构建发布会把下载页降级回 2.0.6。**
- **验证**：`tsc --noEmit`、`vite build` 通过；构建产物中 `2.0.6` 与「申请试用」均为 0 处；浏览器逐页核对导航（首页/功能/下载/反馈）、页脚与额度文案，1440 与 390 两档无横向溢出。
- **发布**：overlay 到 `/opt/shuike-site`（发布前备份 `index.html.bak-20261102-063055`，未使用 `--delete`）。线上 `index.html` 已指向 `index-B4TgGr84.js`（317,241 字节）/`index-D8kWGp15.css`（102,166 字节），旧 bundle `index-LIWFeimc.js` 不再被引用；`downloads/` 470M、`models/` 298M 未受影响，`/downloads/zhixi-v2.0.7.apk`、`/models/zhixi/web/asr-zh-en-v1/sherpa-onnx-wasm-main-asr.js` 均 200；`zhixi.seanyan.store/web/` 与 `/health` 均 200。**回滚 = 还原 `index.html.bak-20261102-063055` 与对应 assets。**
- **边界**：装在手机上的是 V2.0.5 及更早版本时 App 内没有自助开通入口，需走网页版；官网下载页始终给最新版，新装用户不受影响。App 的自助开通只做了代码路径与线上接口核对，未走真实短信端到端。nginx 的 `/api/trial/*` 片段已无调用方，属无害残留，未改动生产配置。Mimosa 深度审计仍未完成，不得据此声称通过安全审计。

## 网页版译文方向与学习包正文显示（2026-11-02，r26 已发布）

- **译文不显示（中文课方向）**：课堂页展示译文时写死按中文目标查（`"zh"` / `"zh-CN"`），但目标语言随讲师语言变化——选中文讲师时会话方向是 zh→en，服务端回的 `targetLanguage` 是 `"en"`。本地假网关实测：DB 里 3 条 `en` 译文齐全，页面 `visibleTranslations` 为空；en→zh 方向一直正常，所以只有中文课受影响。**修法**：新增 `pickLineTranslation`（先按会话目标语言匹配 → 再取任何「非原文语种」的译文 → 最后取第一条），语种代号按主语言归一；课堂页按讲师语言推出目标语言；补翻队列原先写死 `TranslationQueue("zh-CN")`，中文课结束后会把整节中文行再翻成中文，改为跟随讲师语言（en→`zh-CN`、zh→`en-US`）。
- **学习包正文看不到**：课程详情页只渲染条目标题，正文要等「展开」，而展开按钮只在分类超过 3 项时出现。学习包每类通常 1–2 条（纪要 1、疑问 1、词汇 2…），于是纪要正文、疑问解答、词条释义与例句全部无法查看，页面上只有一串标题。**修法**：不超过 3 项时直接展开；正文改由 `ItemBody` 按行渲染，`#` 开头渲染成小标题（旧 prompt 会给纪要小节写 `## 标题`，直接当纯文本会连井号显示），释义与例句里的 `**加粗**` 与行内代码反引号一并去掉标记。
- **验证**：`translate-queue.test.ts` 新增 6 项（英文课取 zh、中文课取 en、`en-US` 与 `en` 互通、多语种优先级、pending 不当作译文、无译文返回 undefined），全量 **94 项通过**（13 文件）；`tsc --noEmit`、`vite build` 通过。**生产构建**用假网关 + 合成麦克风各复测一遍：中文课 3 句均显示英文译文；课程详情三张分类卡正文完整、页面无 `##` 与 `**` 残留。
- **发布**：`/opt/zhixi-webapp/r26`，`current` 从 `r25` 切到 `r26`（`r24`/`r25` 保留）。线上 `index-BhvtVEj3.js` 与本地验证产物 SHA-256 完全一致（`e5a5dd68…`）。**回滚 = `ln -sfn /opt/zhixi-webapp/r25 /opt/zhixi-webapp/current`**。
- **边界**：只改网页版两个页面与译文工具，未改网关、协议与数据结构；未做真实短信与真实课堂的端到端。Mimosa 深度审计仍未完成，不得据此声称通过安全审计。

## V2.0.9 平板双栏 / 主动分句与 V2.0.8 学习包精简（2026-11-02，已发布）

- **V2.0.8 / R20（同批上线）**：学习包 prompt v4 把课堂纪要压成单段摘要并清空分节；词汇/短语/练习等条目支持卡片内长按或 ⋮ 编辑/删除，编辑同步复习卡、删除级联；Room 10→11 增加 `updatedAtMillis` 并迁移回填。生成侧每个提供方每轮只尝试一次，75 秒包超时、429/5xx 冷却 45 秒、鉴权/配置错误冷却 300 秒，DeepSeek/Kimi/MiMo 并行竞速，首个有效结果立即返回；真实联调从 226 秒失败降到 44–47 秒成功。R20 运营后台改为账号中心（账号内展开设备、按账号筛选调用记录、匿名设备清理与保留策略），生产已清理 52 台匿名设备等旧记录。
- **平板首页**：≥840dp 双栏不再等宽拉伸。首页内容上限 1200dp、其他页面 880dp；顶栏与内容共用同一上限和左侧导航轨偏移。≥1000dp 时课程关联与状态并成一行；转写卡按剩余高度铺满并在内部滚动；右栏无疑问时整高占位，有疑问时列表滚动，实时纪要也放右栏；底部控制条按系统导航栏 inset + 160dp 预留，不再压住卡片底边。
- **长表述分句**：新增 `audio/TranscriptClauseSplitter.kt`，与网页版同一套阈值（MAX 16 units / SPLIT 20 / TINY 4 / MAX 8 parts）。云端 `sentence` 模式整段 final、本机 sherpa 长定稿都会先按句末标点、再按从句连词/逗号切；无标点英文在词边界硬切，不会切出 `lazy d`。每个分句单独落库（`segmentKey#n`、时间戳 +n ms），云端 `translation.final` 按相同段数拆分，本机/离线行逐句进入翻译队列；说话人只标首句。
- **验证**：Android JVM **106 项，0 失败**（分句器 16 项）、`:app:lintDebug` 通过、`assembleRelease` 成功；server **157 项 pytest，0 失败**；webapp **118 项 vitest，0 失败**（分句器 18 项）、`tsc --noEmit && vite build` 通过。模拟器 2048×1280 @256dpi（1280×800dp）验待机/录音/注入转写三态，手机 1080×2400 回归；顶栏边缘、双栏比例、整高卡片、底栏留白均截图核对。
- **发布**：V2.0.9 签名 APK **50,847,411 字节**，SHA-256 `ED9F4207A09563113C75BC3F60DC0C4568D150AAE91677E88515C79648F96E81`；Gitee `https://gitee.com/seanyan-dev/zhixi-apk/releases/download/v2.0.9/zhixi-v2.0.9.apk` 已上传并完整下载复验同哈希。官网切换 2.0.9，线上 `index-DUHNu2BV.js` 含该 Gitee 直链。网页版发布到 `/opt/zhixi-webapp/r30`，线上 `index-fqwjlyP4.js` 与本地 SHA-256 一致。网关保持 R20（`/health` 200）。
- **回滚**：网页版 `ln -sfn /opt/zhixi-webapp/r29 /opt/zhixi-webapp/current`；官网恢复 `/opt/shuike-site-backups/20261102-v209/` 下的 `index.html` 与 `assets`；APK 下载页回退 `release.ts` 2.0.8；网关无需回滚。
- **边界**：历史课堂不会自动重新分句，需要重新识别/重新生成；云端译文与源文标点数量不一致时退化为按源句长度比例切分；真实课堂长段落仍要继续收集样本。Mimosa 深度审计未完成，不得据此声称通过安全审计。

## 网页版课堂常驻 / 历史与实时同屏 / 延时对齐（2026-11-02，随 r31 发布）

- **现象**：用户实测网页版课堂三点——①译文跟不上，且只显示最新一句、看不到之前句子；②实时转录也只像在记录最新一句，翻不到旧记录；③切到「学习」「设置」页会直接结束课堂。
- **定位与修法**：
  1. **页面结构**：旧版把「正在识别」放在计时卡、把历史转写放到下面另一张卡。手机首屏只够看到计时卡里的当前一句，历史卡在折叠线以下，观感就是「只记录最新一句」。改为**单张课堂主卡**：计时/控制在顶部，历史句子在上、最新半句固定在最下面，历史与实时在同一个滚动区。
  2. **句模式字段**：官方 `transcript.partial` 是快照，句模式下原文在 `paragraphs[].pieces` + `tail`，扁平兜底在 `pending`，译文预览在 `tailTranslation` 或 `paragraphs[].translation`；旧代码只读 `text`。新增 `classroom-events.ts` 统一收敛，`segmentId` 允许数字（数字 0 不再被 `if (!id)` 丢掉）。
  3. **落库**：`transcript.final` 仍逐条独立落库，但改为按 `(sessionId, segmentKey)` 幂等更新（同一段重复到达不追加重复卡片、变短时清理多余行与译文），并新增复合索引（Dexie v4，迁移测试覆盖 v3→v4 数据保留）。不同 segment 只追加，不存在后一句覆盖前一句的路径。
  4. **切页常驻**：控制器从 `ClassroomPage` 的 `useMemo` 提升为模块级单例（`lib/classroom-session.ts`）。切页只卸载视图，麦克风、WebSocket、计时与落库继续；回到课堂页用当前快照直接恢复。外壳在其他页面显示「课堂进行中 mm:ss · 返回」浮动入口，课堂进行中关闭/刷新页面会触发浏览器离开确认。
  5. **延时对齐 App**：①音频分片 200ms → **100ms**（1600 样本，App 同节奏，网关按字节计费不受影响）；②显式下发 `displayMode: "sentence"`（classic 才下发 segmentation），不再依赖上游默认值；③暂停与停止前先发官方 `session.finalize`，最后半句及其译文不再丢；④处理 `session.ended`，短课堂不会再被误判成断线并自动重连；⑤实时译文预览继续由 `translation.partial` / `tailTranslation` 驱动。
- **测试**：新增 `classroom-events.test.ts`（14 项）、`transcript-store.test.ts`（9 项）、Dexie v3→v4 迁移测试（1 项）；`tsc --noEmit` 通过，vitest **142 项通过（17 文件）**，`vite build` 通过。
- **端到端**：本地假网关（FastAPI，仅回环）+ Edge 无头 + 合成麦克风，跑生产构建，16 项断言全过：实时预览取到 `paragraphs+tail`（“The point of this exercise is to practice” / “这个练习的要点是练习”）；4 条历史 + 实时行同屏且每句都有对齐译文；数字 0 号段落库；切到 `#/learning` 后浮动入口显示「课堂进行中 00:09 返回」，期间音频仍增长 112,000 字节（约 3.5 秒 @32KB/s），返回后相位仍是「听课中」且历史完整；390px 视口 `scrollWidth === clientWidth === 390`；暂停/继续正常；停止后 `finalize` 计数 2、补齐最后两句，落库 6 行 6 译文，结束文案为「课堂已结束」。配置实测为 `displayMode: "sentence"` 且不含 `segmentation`。
- **边界**：真实上游是否每条都下发 `translation.partial` / `tailTranslation` 仍取决于 Lecsync 服务端，本轮用假网关覆盖了两种字段形态；真实课堂的延时读数仍需下次上课时观察。本轮未改网关、协议、计费与同步逻辑。Mimosa 深度安全审计仍未完成，不得据此声称通过安全审计。

## 网页版课堂小窗 + 屏幕常亮（2026-11-02，r31 已发布）

- **需求**：用户问浏览器能否申请「悬浮窗权限」并一直保活。结论先说清：网页没有 Android 的 `SYSTEM_ALERT_WINDOW`，也没有后台保活权限；桌面 Chromium 有 Document Picture-in-Picture，可做始终置顶的小窗；手机浏览器不支持任意 DOM 小窗，只能做屏幕常亮。
- **实现**：
  1. **课堂小窗**（`lib/classroom-pip.tsx` + `components/classroom/ClassroomMini.tsx`）：仅当 `documentPictureInPicture` 存在时显示「小窗」按钮（桌面 Chrome/Edge 116+）。用户点击后用 `requestWindow({380,500})` 开窗，镜像主文档的样式表（外链改绝对地址 + `<base>`）、渲染独立的 React 根；小窗显示阶段、计时、最近 8 句（原文 + 译文）与实时半句，并提供暂停/继续、停止、回到课堂、关闭小窗。与主页面共享全局 `ClassroomController`，所以主窗口最小化/切标签页时继续计时、采集与落库。
  2. **屏幕常亮**（`hooks/useScreenWakeLock.ts`）：课堂进行中在 `Shell` 里申请 `navigator.wakeLock.request("screen")`；页面重新可见时补申请；停止课堂即释放。不支持、页面不可见或用省电模式拒绝时静默降级。
  3. **补翻队列单例**（`lib/translation-queue-registry.ts`）：停止可能从主页面或小窗触发，两边共用同一个 `TranslationQueue`，避免同一批未翻译行重复排队、重复扣额度。
  4. **降级**：Safari/Firefox/手机浏览器不显示小窗按钮；设置面板注明「锁屏或切到其他 App 仍可能被系统暂停，需要真正后台录音请用 App」。
- **测试**：`tsc --noEmit` 通过；vitest **142 项 / 17 文件**通过；`vite build` 通过。
- **端到端**（假网关 + Edge 156 无头 + 合成麦克风，生产构建）：
  - 小窗实际打开：标题「知习 · 课堂小窗」、body class `pip-body`、内部尺寸 301×397、计时字号 28px、样式表已镜像、`base` 指向主文档；显示 5 条转写（4 条历史 + 实时行）且每条都有译文；按钮为「暂停 / 停止 / 回到课堂 / 关闭小窗」。
  - 在小窗点「暂停」「继续」会驱动主页面相位（已暂停 → 听课中）；切到 `#/learning` 后小窗仍打开、相位仍是「听课中」，3.2 秒内音频继续增长 **102,400 字节**；从小窗点「回到课堂」主窗口回到 `#/` 且小窗保留；关闭小窗后主会话仍是「听课中」。
  - Wake Lock：实测真实 `navigator.wakeLock.request('screen')` 返回 `released:false`；E2E 计数为申请 1 次、停止时释放 1 次。
  - 停止后相位「已结束」、落库 6 行、`finalize` 计数 2；390px 视口 `scrollWidth === clientWidth === 390`，操作区宽 186px 不溢出。
  - 小窗截图与主页面截图已人工核对（桌面 1440 / 手机 390）。
- **发布**：从合并后的 `main`（`cb89cd4`）重新构建并发布到 `/opt/zhixi-webapp/r31`，`current` 从 `r30` 切到 `r31`（`r30` 保留回滚）。上传后远端与本地 SHA-256 完全一致；线上 `index-uM6ObI_b.js` 499,871 字节（`1294b08e…f96495`）、`index-CjeYdPlM.css` 25,310 字节（`82c35238…c5ce0`）、`app-icon-DnJRG8jj.png` 72,614 字节（`086eb660…`）。公网 `/web/` 与 `/health` 均 200；线上包内 `documentPictureInPicture` 与 `wakeLock` 均存在，Edge 无头逐页冒烟零控制台错误，1440/390 无横向溢出。**回滚 = `ln -sfn /opt/zhixi-webapp/r30 /opt/zhixi-webapp/current`**。
- **边界**：Document PiP 仅桌面 Chromium；关掉主标签页会同时结束课堂；Wake Lock 只防熄屏，不防切 App/锁屏/系统杀后台；手机端没有悬浮窗权限，真正后台录音仍以 App 为准。本轮未改网关、协议、计费与同步。Mimosa 深度审计未完成，不据此声称通过安全审计。

## 防 AI 复刻加固（2026-11-03，r21 已发布）

- **暴露面审计**：
  - GitHub 仓库当前为 **public**（负责人决定保持公开 + 专有许可）。公开源码仍是「用 AI 直接读源码复刻」的最大入口；服务端提示词、限流与风控逻辑都在公开仓库里，前端混淆无法解决。
  - 线上网页包（r31）扫描未发现 API key/上游密钥/系统提示词；`server/.env.example` 的敏感项全部是 `replace-*` 占位符（按长度、字符类与熵核验，未输出值），不是真实凭据。
  - Android release 已开启 R8 minify + shrinkResources；试用/激活已有手机号、设备与 IP 三路限流；AI 文本与学习包走账号额度。
- **本轮代码加固**：
  1. **提示词防泄露**：`v2_provider.py` 的系统提示要求把讲义/转写当数据、禁止复述提示词，并埋入哨兵串；学习包、文本翻译、视觉三条通道在解析前检查输出，命中哨兵或系统提示原文即 `ProviderInvalidResponse`，不再把内部规则当内容返回。新增 `tests/test_prompt_guard.py`（3 项）。
  2. **学习包限流**：`/v2/learning-pack` 与 `/v2/learning-pack/jobs` 共用每设备 12 次/分钟闸门，降低脚本化批量生成与蒸馏速度（不影响正常一节课几次的节奏）。
  3. **发布产物闸门**：`scripts/check-release-artifacts.mjs` 扫描 `webapp/admin/site` 的 `dist`，拦截环境变量名、`sk-` 密钥、私钥块、长 Bearer、提示词哨兵、上游 `api.lecsync.com` 域名与 source map；只打印文件/行号/规则，不打印命中值。`--self-test` 通过，当前三个 `dist` 全部 PASS。
  4. **使用边界**：新增 `SECURITY.md`，README 明确「公开用于协作与审阅、不授予开源许可（All rights reserved）」，禁止批量抓取、训练/蒸馏竞品模型、转售服务、绕过额度与设备限制。
  5. **专有许可**：新增 `LICENSE`（All Rights Reserved）：除 GitHub 平台必要的查看/fork 外不授予任何使用许可；禁止部署、分发、衍生、训练/蒸馏竞品模型、转售与移除标识；提交 PR 视为授予权利人使用该贡献的许可。README 与 `SECURITY.md` 已链接。
- **验证**：server **160 项 pytest 全绿**（新增提示词防护 3 项）；webapp 既有 **142 项 vitest / 17 文件**不受影响；产物扫描 self-test + 三个 dist 全 PASS。r21 的 venv 内导入检查：哨兵存在、规则长度 364、3 个泄露标记、两条学习包路由都有 `learning_pack_limiter.allow`。
- **发布**：网关从 `/opt/zhixi-gateway-20261102-r20` 切到 `/opt/zhixi-gateway-20261103-r21`。r21 由 r20 **完整复制**后只覆盖 `app/v2_provider.py` 与 `app/v2_routes.py`（先核对两文件与改动前 `main` 的 SHA-256 一致，确认没有生产侧私有补丁）；覆盖后远端 SHA-256 与本地一致（`6859609b…` / `c6a2a11e…`）。systemd 单元备份 `/etc/systemd/system/zhixi-gateway.service.bak-r20-20261103`；重启后 `active`、本机与公网 `/health` 均 200、`/web/` 200、journal 无 traceback。r20 目录保留。**回滚 = `cp /etc/systemd/system/zhixi-gateway.service.bak-r20-20261103 /etc/systemd/system/zhixi-gateway.service && systemctl daemon-reload && systemctl restart zhixi-gateway`**。
- **边界**：仓库仍公开，`LICENSE` 只能约束使用、不能阻止阅读；本轮未做仓库私有化。服务端重启会中断当时正在进行的云端课堂 WebSocket，需要客户端重连。Mimosa 深度审计未完成，不据此声称通过安全审计。

## 首次自助开通卡住：服务端兼容修复，V2.0.10 APK 已撤回（2026-11-03）

- **现象**：新手机号在 App 内首次激活时，短信验证通过、服务端已开卡，但页面仍停在「开通并激活」，用户重复点击只得到验证码失效；随后换设备重新获取激活验证码才成功。
- **日志证据**（生产 `112.4.211.20`）：14:55:28 激活验证码请求返回 404 `account_not_found` → 14:55:32 自助验证码 200 → 14:56:00 `/v1/trial/apply` 201 Created（账号已创建并绑定设备）→ 14:56:01–14:56:04 连续 13 次 `apply` 400；期间**没有** `GET /v1/accounts/me`，直到 14:57:27 注册新设备、14:57:46 走激活接口才成功。
- **根因**：服务端 `TrialApplicationResponse` 已增加 `limits` 字段，但 Android 2.0.9 及更早版本的 DTO 没有；客户端使用 `Json { ignoreUnknownKeys = false }`，201 响应因未知字段 `limits` 反序列化失败。客户端把「已开卡」当成失败，既不拉取账号状态也不退出表单；用户重试时验证码已被消费，只能收到 400。
- **修复（服务端，无需更新 App）**：网关 R22 从 `/v1/trial/apply` 的 201 响应中移除 `limits`，只保留旧客户端认识的 `applied`/`phoneMasked`/`validUntil`/`message`/`deviceBound` 五个字段。额度本来就可以从 `/v1/accounts/me` 获取，网页版也没有使用 apply 响应里的 `limits`，因此不影响任何现有功能；2.0.9 及更早版本可直接完成首次激活。
- **验证**：server **160 项 pytest，0 失败**（自助开通测试改为断言 201 响应键集恰好为上述五项）；Android **108 项 JVM，0 失败**（新增严格 Json 解析「无 limits 的旧响应」回归测试）；webapp **142 项 vitest、tsc/vite build 通过**（仅把 `TrialApplication.limits` 从类型中移除，运行时未使用）。R22 上线后 `/openapi.json` 的 `TrialApplicationResponse` 字段为五项；`/v1/accounts/me` 仍返回完整额度。
- **发布与撤回**：R22 部署在 `/opt/zhixi-gateway-20261103-r22`，systemd 单元备份 `/etc/systemd/system/zhixi-gateway.service.bak-r21-20261103`，重启后 active、`/health` 200。V2.0.10 APK 已从 Gitee 删除、官网下载页回退 2.0.9（线上 `index-DUHNu2BV.js`），启动公告改为「激活问题已修复，无需更新」。2.0.10 的客户端 DTO 修复只保留在源码，供下次正式发版使用，不再对外分发。
- **回滚**：网关恢复 `zhixi-gateway.service.bak-r21-20261103` 并 `daemon-reload && restart`；官网恢复 `/opt/shuike-site-backups/20261103-v210-rollback/`；APK 保持 2.0.9，无需回滚 Gitee。
- **边界**：服务端只删除 201 响应中的一个字段，开卡/绑定/额度结算逻辑未改；历史已开通账号不受影响；2.0.9 客户端仍会把「已开卡但设备未绑定」误报为已激活（仅设备令牌失效等边缘场景），下次发版再修。Mimosa 深度审计未完成，不据此声称通过安全审计。

## PR #106 同步与验证（2026-11-11，部署前历史快照）

以下为同日合并/部署前的核对记录，按原事实保留；OPEN、无审阅、未部署等状态已被下方 [上线进度](#2026-11-11-上线进度) 更新，不代表当前状态。

- **GitHub**：功能候选 `9023fbee902c329c925f7814d9dde1c4d2b1c12d` 已推送；[PR #106](https://github.com/YZUSeanYan/course-companion/pull/106) 已转为待人工审阅（非 Draft）。本日核对为 OPEN、无审阅、未合并；main 仍为 `1233a51`。后续纯文档提交不改变这个功能验证基线，CI 需按最终 head 单独核对。
- **CI**：该功能提交的 Admin、Android、Server、Site、Webapp 和 Python/JS-TS/Kotlin CodeQL 共 8 项实际检查全部成功。CodeQL 汇总项为 neutral/skipping，不表示三个分析任务失败；PR merge ref 查询无 open code-scanning findings，但不据此宣称没有未知问题。
- **本地**：Server 218 passed、10 warnings；Webapp 183 passed（22 文件）且 TypeScript/Vite 构建成功；Android 126 JVM tests、0 failures/errors/skips，lint/Debug 构建成功，lint 为 0 errors、46 warnings + 4 hints。前端仍有 >500 kB bundle 警告。Admin/Site 于 11 月 11 日重新构建成功，三端发布产物泄漏扫描均通过。
- **真实回环联调**：仅一次独立 Uvicorn HTTP/WebSocket 运行，50 passed / 1 failed / 0 skipped：HTTP 5/5、两条 WS/ticket 路径 36/36、合成 PDF 归属/恢复 8/8、假上游隔离 1/1；真实外部请求为 0。唯一失败是清理探针设 1 秒而 Windows 对已关闭端口的连接拒绝约需 2 秒；进程正常退出，独立清理复查 3/3 通过（进程不存在、无监听、连接拒绝），未把首次运行描述为全绿。
- **浏览器**：发布构建可实际新建合成课程并打开详情，恢复上传及解析额度说明可见。定位点击接口超时，可视点击/输入可用；文件选择器自动化不支持，手机宽度截图超时。完整讲义恢复 E2E、微信网络/音频仍未验证。
- **本日公网只读核验**：`/health` 为 `ok`、`providerConfigured=true`；`/openapi.json` 尚无 `/v2/lecsync/realtime/ticket`，`TrialApplicationResponse` 仍恰好为 `applied/deviceBound/message/phoneMasked/validUntil` 五字段。该证据只能说明公网可见行为，不能证明服务器内部运行目录或 systemd 状态；本轮没有登录服务器或读取生产配置。
- **候选与发布**：本地候选按 `9023fbe` 封装网关源码、网页版/后台静态产物并记录 SHA-256，不包含密钥、数据库、用户讲义/音频或签名材料。候选未上传生产，官网及 APK 发布元数据未改；Android 源码 `versionName=2.0.10` / `versionCode=12` 不代表已重新发布。
- **剩余门槛**：至少一位同学审阅、负责人确认 Squash merge、真实 iOS/Android 微信、Android arm64 讲义恢复和文件选择、生产备份/日志脱敏/代理限流与安全回退演练。步骤见 [上线检查表](ROLLOUT-20261110.md)。生产服务切换和正式 APK 签名/上传仅由负责人执行，本记录不是部署完成声明。

## 2026-11-11 上线进度

### 授权与合并

- 用户在会话中明确批准本次生产操作的一次性例外并表示审阅完成，随后明确批准按最终 head `2119055` Squash merge PR #106，以及 V2.0.11 / `versionCode=13` 的 APK 和官网发布。实际 Squash 合并提交为 `a617dfc`，main CI 全部通过。
- 审阅依据是用户在会话中的确认，不记作 GitHub Review/APPROVED 事件。该次例外不修改 `AGENTS.md`，不长期放宽生产限制；本节记录已完成事实，不为后续操作授予权限。

### 网关、网页版、备份与数据变化

- 切换前 R22 源码哈希与 `1233a51` 一致；网关已切至 `/opt/zhixi-gateway-20261111-r23`，随后网页版 `current` 软链切至 `/opt/zhixi-webapp/r32`，旧发布目录保留。
- `/root/zhixi-backup-20261111` 内已有切换前/切换时一致性 SQLite 备份（`integrity_check=ok`）、对应文档备份，以及原 unit、nginx、官网备份。未展示秘密值；备份完整性检查不是恢复/安全回退演练。
- 启动时既有保留策略清理 19 台过期未绑定设备；账号、绑定和任务数量均未变。不能把这次启动描述成“数据零变化”。
- zhixi nginx 日志已不含查询串；Uvicorn 使用 warning / no-access-log。旧版本保留不代表可以裸回退到缺少文档归属或 URL token 防护的旧代码，仍须遵守上线检查表的安全回退限制。
- 公网 `/health` 为 `ok`、`providerConfigured=true`；OpenAPI 已有 `/v2/lecsync/realtime/ticket`，无凭据 POST 返回 401。`TrialApplicationResponse` schema 恰好保留 `applied/deviceBound/message/phoneMasked/validUntil` 五字段；不是本轮真实短信申请验收。
- 线上网页版 bundle `index-9L8IcNx0.js` 已确认含 ticket 与讲义恢复文案；这只证明发布产物已可见，不替代浏览器文件选择恢复或真实微信端到端验收。
- 公网 WSS 负向冒烟：Realtime 合成无效 ticket、URL `access_token` 占位值以及 Voice Typing 合成无效 ticket 均升级后以 4401 关闭。未用真实凭据、未调用付费上游，不能写成合法 ticket、真实音频或生产付费 ASR 已通过。

### Android 构建、APK 与官网

- V2.0.11 / code 13 已获批准，构建输出 metadata 确认版本号；包名不变，签名证书与已归档公开 V2.0.9 一致，zipalign / apksigner 均通过。
- release 构建、`:app:testDebugUnitTest`、`:app:lintRelease`、`:app:assembleRelease` 成功；**126 tests，0 failures，0 skips**。Release lint XML 为 **0 errors、48 warnings、4 hints**，不能沿用先前 Debug 的 46 warnings。
- 首次尝试 `:app:testReleaseUnitTest` 因项目不存在该任务而失败；随后执行正确的 Debug JVM 测试及 release lint/assemble 成功。保留失败命令记录，没有跳过测试，也不声称运行过 Release 单测任务。
- 签名 APK 已上传 `https://shuike.seanyan.store/downloads/zhixi-v2.0.11.apk`，大小 **50,863,795 字节**，SHA-256 `f1794c85bcbaa28805a8b7e1603095e21e15fffd9222df2fa34bfd720d2fd866`。服务端文件哈希一致；公网完整 GET **200**，Content-Length 与实收字节均为 50,863,795，耗时 125.1 秒，下载后 SHA-256 一致。
- 官网已发布 17 个文件并切到 V2.0.11 / `index-BpWB-40T.js`；发布前备份在 `/root/zhixi-backup-20261111/site-before`，旧哈希资源、downloads 和 models 保留。
- 公网 `https://shuike.seanyan.store/#/download` 渲染 DOM 冒烟通过：标题「知习 App v2.0.11」、50.9 MB、arm64、正确下载 URL、SHA-256 展示、页脚 2.0.11。该检查不代表新 APK 已安装或真机升级验证通过。

### 保留的测试基线与未验证项

- 先前 Server **218 passed、10 warnings、未跳过**；Webapp **183 passed（22 文件）**及 TypeScript/Vite 构建成功。合成 Uvicorn 联调仍记为 **50 passed / 1 cleanup failed / 0 skipped**，随后独立清理复查 **3/3 passed**，不追改为首次全绿。
- 本轮未做真实 iOS/Android 微信、Android arm64 真机、新 APK 真机安装/升级、生产付费 ASR 或真实课堂检查；完整讲义恢复文件选择端到端仍未验证。备份恢复演练、非回环代理/限流与安全回退演练未提供完成证据，继续保留待验收状态。
- 公网完整 APK 下载与官网切换均已完成，不再列为 pending；部署、完整性与负向冒烟通过不等同于所有功能或真实课堂质量通过。

## 产物（截至 2026-11-11）

- Debug：`app/build/outputs/apk/debug/app-debug.apk`
- 当前已发布并完成公网完整下载校验的 Release：**V2.0.11，`versionCode=13`，50,863,795 字节**，SHA-256 `f1794c85bcbaa28805a8b7e1603095e21e15fffd9222df2fa34bfd720d2fd866`；包名及证书延续归档公开 V2.0.9，zipalign / apksigner 通过。
- 历史公开 Release V2.0.9：`versionCode=11`，50,847,411 字节，SHA-256 `ED9F4207A09563113C75BC3F60DC0C4568D150AAE91677E88515C79648F96E81`，当时已从 Gitee 完整下载复验。V2.0.10 于 2026-11-03 撤回，不再分发。
- 官网下载页：`https://shuike.seanyan.store/#/download`；当前 APK：`https://shuike.seanyan.store/downloads/zhixi-v2.0.11.apk`。公网完整下载与页面渲染冒烟均已完成，未进行新包真机安装/升级验收。
- 运营后台：`https://zhixi.seanyan.store/admin/`，管理员密码只保存在服务器 `/opt/zhixi-gateway/.env`（600），不写入仓库、APK 或前端 bundle。
- Release 默认网关为 `https://zhixi.seanyan.store`，不包含模型权重或 API 密钥；离线模型首次使用前需下载或恢复。
