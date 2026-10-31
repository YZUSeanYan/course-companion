# 知习 · 本地验收记录

验收日期：2026-10-31。范围包括本地模拟器、设备仪器测试、本机 FastAPI、mock 模型，以及正式 HTTPS 网关的小额合成内容联调；不包含全部真实模型与完整生产质量认证。

## 自动化结果

- Android JVM：**71 项单元测试，0 失败**，包含课堂、导入、DTO、FSRS、CET6 CSV/TSV 词表、AI 地址校验、术语编辑格式、FastAPI 错误数组、文本 PDF 视觉需求、学习/讲义列表复合 key、真实下载字节进度、镜像回退与完整性校验。
- FastAPI：**73 项 pytest 通过**，包含完整 Lecsync REST/Realtime/Voice Typing、提供方字段归一化、Kimi 温度约束、schema 修复失败后的跨提供方回退、视觉模型复用现有密钥与 MiMo→DeepSeek 回退、幂等、配额、任务归属、Webhook 加密与验签、纪要、手动疑问、文本/视觉模型、页面资产、上传和密钥不泄露。
- Android lint、debug、release、debugAndroidTest：全部成功。官网 TypeScript/Vite 构建成功，本轮下载页与发布常量定向 ESLint 通过；全仓模板组件仍有此前已知的 8 项 lint 规则错误，本次未改动这些模板。
- **19 项设备测试全部通过**：Room 2→8 迁移、旧课堂/复习卡/历史自动识别保留、模型隔离与回收站恢复、中文与英文 ASR、录音暂停/继续/停止且 session 不变、v2 与 Lecsync 鉴权恢复、Realtime 消息与过期令牌恢复、云端失败→本机识别回退，以及课堂/复习 UI fixture。

## 正式部署与真实联调

- 正式网关 `https://zhixi.seanyan.store/health` 返回 200 和 `providerConfigured=true`；systemd `zhixi-gateway` 为 active，后端仅绑定 `127.0.0.1:8766`。当前运行 `/opt/zhixi-gateway-20261031-r6`，R5/R4/R3 与旧 unit 均保留用于回滚。
- Lecsync 实际文本翻译成功返回中文结果；1 秒合成音频完成 `session.ready → usage.update → session.ended`。
- DeepSeek Flash、Kimi `k3.1-pro-highspeed`、MiMo `mimo-v2.6-flash` 均已分别生成真实学习包；Kimi 按接口要求使用 `temperature=1`。提供方字段别名、`sourceId/sourceIds` 和严格 schema 修复已验证。
- APP 设置页已显示正式域名在线；公网 WebSocket 云端课堂实际开始、收到实时文本并正常停止。R4 公网合成文本生成返回 HTTP 200；随后 APP 内再次真实生成并保存 **39 项学习内容和复习卡片**，完整通过 APP→网关→模型→Room 链路。
- 视觉能力已用真实模型探针和正式网关验证：MiMo `mimo-v2.6-pro` 与 DeepSeek `deepseek-flash` 均能读取合成图；正式 `/v2/learning-pack` 返回 200、`model=mimo-v2.6-pro` 和 1 条 `visualNotes`，模型正确读出 A/B 支座、中心 `F = 12 kN`、`L = 8 m`、`24 kN·m` 及公式，sourceId 为有效的 `qa-page-1`。R6 公网再次验证 MiMo 经一次修复仍结构无效时自动切换 `deepseek-flash` 并返回 200，证明跨视觉提供方回退生效。视觉端点复用现有 MiMo/DeepSeek 密钥，不新增 APP 密钥。
- 官网首页、功能、隐私与下载页已更新并发布 V2.0.2；公网 APK 完整下载后 SHA-256 与本地签名包一致。前代 APK、下载计数、网关健康及 `seanyan.store`、`www`、`api`、`quiz`、`hanshang`、`classroom`、`listen`、`token` 均保持 200。
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
- 正式隐私政策包含本地/在线路径、提供方、凭据、保留删除、模型文件、第三方组件、未成年人及课堂授权；设置中有官网按钮。

## 真实验收边界

1. Lecsync 与 DeepSeek、Kimi、MiMo 已完成真实学习包联调；其余 Lecsync 能力主要完成 mock/协议验证，不能把全部高级能力都称为真实质量认证。视觉模型已启用并完成合成工程图真实验收；真实外教讲义中的手写推导、密集公式、扫描倾斜与超大版面仍应继续收集样本验收。
2. 自有国内镜像的三个官方包已连续完成 APP 内下载、提取、全文件校验与启用，公网镜像哈希也与官方一致；镜像篡改、断连回退和旧模型保留由 JVM fixture 覆盖。真实不同运营商的下载速度仍需真机网络长期观察。
3. 真实外教口音、长课续航、真机麦克风和模型成本未验收；视觉合成工程页已验收，不代表所有真实讲义版式都已达到同等识别质量。
4. MinerU/LibreOffice 仍为可插拔解析器，未配置时复杂页只保留原图并标待解析；DOCX/PPTX 需对应环境。
5. 正式 HTTPS 网关、V2.0.2 签名包与官网下载页已完成；未准备参赛 PPT。

## 产物

- Debug：`app/build/outputs/apk/debug/app-debug.apk`
- V2.0.2 签名 Release：桌面 `知习-V2.0.2.apk`，`versionName=2.0.2`、`versionCode=4`，v3 签名验证通过；大小 **50,470,298 字节**，SHA-256：`184B7AB5B7543F7B09401064478AA45B73EA31FE0B65E95EFF3F81117E91BE93`。
- 官网下载：`https://shuike.seanyan.store/#/download`，公网 V2.0.2 APK 已完整下载并核对为同一 SHA-256。
- Release 默认网关为 `https://zhixi.seanyan.store`，不包含模型权重或 API 密钥；离线模型首次使用前需下载或恢复。
