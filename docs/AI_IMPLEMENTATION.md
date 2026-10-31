# 知习 · AI 实现与参赛说明

## 产品闭环

听课转写与翻译 → 手动标记疑问 → 复杂讲义/课堂内容分析 → 主题化学习纪要与参考解答 → 词汇短语及 FSRS 复习。

## 模型分工

0. **Lecsync 全功能与离线回退**：统一自有网关覆盖文本翻译、同步/异步转写、Voice Typing、Realtime、录音、模型发现和 Webhook；APK 不持有上游密钥或一次性 socket token。Realtime 支持双向字幕、说话人、术语、AI 润色、实时纪要和用量；恢复失败且本机模型可用时切回 sherpa。文本翻译优先 Lecsync，失败后进入 DeepSeek→Kimi→MiMo。官方计费分别按音频时长、源字符或最终文本字符，详见 `LECSYNC_COMPATIBILITY.md`。离线 sherpa 模型从受管目录加载，支持校验、回收站恢复；release 不内置权重。
1. **本地识别**：sherpa-onnx 负责课堂音频转写；原始 WAV 默认不保存。
2. **文本模型**：翻译定稿字幕，按 SESSION/MATERIAL/EXAM 生成纪要、词汇短语、重难点、自测卡及手动疑问参考解答。
3. **文档解析器**：PDF 原生文本与页图并行；扫描/复杂页可插拔 MinerU，保留原始图像和解析器 bbox，不让模型猜坐标。
4. **多模态模型**：机械结构、电路、流程图、曲线图、手写批注等需要视觉关系的页面，发送页图和 OCR 上下文，返回有 sourceId 的视觉说明。未配置时明确失败，不把 OCR 当作视觉理解。
5. **复习**：FSRS 只负责排期；CSV/TSV 标准 CET6 词表只负责确定性导入、去重和标签，不由模型生成整份词库。

## 协议与数据

- `/v2/translate`：lineId、sourceText、sourceHash、targetLang，短时缓存，不将正文写日志或数据库。
- `/v2/lecsync/*`：设备鉴权后的完整 Lecsync HTTP/WebSocket 网关。支持模型发现、全参数翻译、音频上传/任务/分页、Voice Typing、Realtime 全事件、录音与管理员 Webhook。翻译 pending 也可按设备恢复查询；签名 URL、上游 token、API key 与 Webhook secret 不下发 APP。
- `/v2/learning-pack`：chunks、analysisMode、manualDoubts、visualBlocks，返回 minutes、doubtAnswers、visualNotes、词汇短语及自测卡。
- `/v2/documents/analyze`：上传 PDF/JPG/PNG，返回每页原图、原生/OCR 文本、状态与区域；页图通过受控路径读取。
- Android Keystore 加密设备 token；模型密钥只在服务端环境变量。设置页可运行时修改 AI 服务地址，学习包、文档与翻译共用；地址变更会清除旧 token，单次请求固定同一 base URL，避免跨服务发送凭据。release 禁止明文 HTTP，外部模型 URL 仅允许公网 HTTP/HTTPS 并校验 DNS。
- AI 学习内容与复习卡同一 Room 事务；只有词汇、短语、自测内容进入 FSRS，长纪要不强制变成卡片。

## 代码边界

- 既有自有代码：水课雷达离线版玻璃 UI、录音服务、离线 ASR、历史记录。
- 本次新增：翻译、手动疑问、v2 纪要、页面级文档资产、多模态分析、CET6 词表与复习、隐私与导出。
- 自动提问不再产生新事件；旧 `question_events` 仅作为历史自动识别保留。
- 不用在线版课堂雷达 UI、在线识别链路或第三方 APK 逆向基座。

## 演示口径

文本提供方已完成 DeepSeek Flash、Kimi `k3.1-pro-highspeed`、MiMo `mimo-v2.6-flash` 的真实学习包联调；视觉已完成 MiMo `mimo-v2.6-pro` → DeepSeek `deepseek-flash` 的合成工程图真实验收。其余异常、配额、跨提供方回退和工具调用边界以 mock/协议测试覆盖，不能把 mock 当成真实模型质量认证。复杂页未配置解析器时展示原图并标待解析，不能宣称已理解。任何缓存必须来自真实模型并明确标注“AI 预生成缓存”。
