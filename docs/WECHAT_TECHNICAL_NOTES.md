# 微信平台技术核验附录

核验日期：2026-11-11。配套 [产品与上线调研](WECHAT_MINIPROGRAM_RESEARCH.md)。本附录是平台能力调研，不代表所有能力已经在知习开发或真机测试。

## 1. 开发框架选择

| 路线 | 适用性 | 不能自动解决什么 |
|---|---|---|
| 原生 WXML/WXSS/JS | 本轮首选，只有微信、小规模本地业务、最小运行时与编译依赖 | 生命周期、容量、权限、主体资格仍需处理 |
| Taro | 已有React/Vue团队，或明确多个小程序/H5共用时适合 | 不直接复用Compose；有编译/运行时与平台适配成本 |
| uni-app | Vue团队、需要多端业务共用 | Android原生扩展不能带进微信；条件编译仍要逐端验证 |

Taro官方Skyline文档写Worklet部分从4.0.8支持，需要半编译模式；不能因此宣称任何版本/组件组合都兼容。uni-app官方WebView+glass-easel指南存在，但本次未核实其全部Skyline/手势/路由组合。

官方维护者来源：
- https://github.com/NervJS/taro/blob/main/README.md
- https://github.com/NervJS/taro-docs/blob/master/docs/skyline.mdx
- https://github.com/NervJS/taro-docs/blob/master/docs/optimized.mdx
- https://uniapp.dcloud.net.cn/tutorial/platform.html
- https://uniapp.dcloud.net.cn/tutorial/mp-weixin-glass-easel.html

## 2. 渲染与动效不是同一层概念

原生/Taro/uni-app是开发方式；WebView/Skyline是渲染引擎；exparser/glass-easel是组件框架；Worklet是特定运行机制。glass-easel不是“玻璃特效”。

- 普通WebView支持CSS transition/animation；官方 `this.animate` 与滚动驱动动画有WebView限定，不当作Skyline通用接口。
- Skyline精简CSS；可页面/分包级混用WebView，支持不同页跳转。
- 官方“无缝自动退回WebView”有**不使用Skyline新增特性**的前提。已经采用Worklet/手势/路由者要写自己的降级，不是自动polyfill。
- Worklet动画API仅Skyline；不得在不支持端模块顶层无条件调用 `wx.worklet`。
- 手势组件是虚节点、单直接子节点、Worklet回调，不等同普通冒泡touch事件；需处理与滚动的协商。
- Skyline跨页共享元素、自定义路由要求**连续Skyline页面**。WebView `share-element` 与 `page-container` 的方案，不等于跨两个独立WebView页。
- Skyline组件表对 `editor`、`web-view`、movable、scroll-view等列有差异，自定义导航也需处理；不能机械复制整个Web CSS布局。
- 首版本轮只用短transform/opacity和翻卡，不为了动效全面切换双渲染。

官方起步页与兼容页存在版本口径不同：起步页列Android/iOS微信8.0.40+/基础库3.0.2+；兼容页仍有更早客户端版本和部分端规划说明。**这些页面不构成统一当前支持矩阵。** WebView使用glass-easel的3.8.12门槛也不是Skyline总体门槛。选择目标基础库后，检测API/`wx.canIUse`并记录实际 `this.renderer`，真机验证降级。规划/内测不能推断为已支持。

来源：
- https://developers.weixin.qq.com/miniprogram/dev/framework/view/animation.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/features.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/worklet.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/gesture.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/share-element.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/custom-route.html
- https://developers.weixin.qq.com/miniprogram/dev/component/share-element.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/component.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/migration/
- https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/migration/compatibility.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/glass-easel/migration.html

## 3. 后台、计时、通知与日历

这些是平台迁移参考，不表示知习原App已有番茄钟或日历功能。

官方运行机制本次写：切后台短暂运行后“目前是5秒”挂起JS；挂起较久“目前是30分钟”可能销毁；资源紧张会提前回收，直接杀微信可能不调用退出保存。不是应用可依赖的保活时限。

- 时间戳是计时真值，setInterval只刷新前台显示；开始/暂停/结束立即存储，不只在退出保存。
- `setKeepScreenOn` 只在当前小程序生效，离开即失效，不是后台运行权。
- 网络指南写后台未结束请求约5秒后可能 `interrupted`，前台恢复前不能继续普通网络调用。长AI任务应服务端继续、客户端凭任务ID恢复。
- 订阅消息需要用户动作、可用模板与服务器发送；success不等于每个模板都accept，“总是保持选择”不等于无限推送次数。长期模板资格与具体个人AppID可用项需后台核验。
- `getAppAuthorizeSetting.notificationAuthorized` 是微信App宿主的系统权限，不是小程序拥有Android独立通知渠道。没有通用 `scope.notification` 可供随意申请。
- `addPhoneCalendar/addPhoneRepeatCalendar` 是用户主动授权添加事件，不等于任意读取、双向同步或精确闹钟。
- 不以静音音频、后台定位伪装保活。不承诺杀进程后准点本地通知或一直更新通知栏倒计时。

来源：
- https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/operating-mechanism.html
- https://developers.weixin.qq.com/miniprogram/dev/api/device/screen/wx.setKeepScreenOn.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/subscribe-message.html
- https://developers.weixin.qq.com/miniprogram/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.html
- https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-message-management/subscribe-message/api_sendmessage.html
- https://developers.weixin.qq.com/miniprogram/dev/api/base/system/wx.getAppAuthorizeSetting.html
- https://developers.weixin.qq.com/miniprogram/dev/api/device/calendar/wx.addPhoneCalendar.html
- https://developers.weixin.qq.com/miniprogram/dev/api/device/calendar/wx.addPhoneRepeatCalendar.html

## 4. 文件、PDF与OCR

- `chooseMessageFile` 是**从微信客户端会话选文件**，不是遍历手机任意目录或其他App私有存储。
- `openDocument` 是新页面预览PDF/Office，不等于内嵌阅读器、页内批注、文字抽取或页码定位SDK。
- 文本PDF需要解析；扫描PDF需渲染成图片再OCR；公式/表格/阅读顺序另验，不把OCR当视觉理解。
- 微信VisionKit确有OCR。官方文档写2.27.0起，静态 `createVKSession({track:{OCR:{mode:2}}})` + `runOCR` 输入RGBA像素buffer/宽高，不是PDF二进制。
- OCR完整端覆盖、公式/语言准确率、离线保证、个人主体适用范围本次没有足够证据，标为未知；失败可回退手工文本。
- 本轮没有启用PDF/OCR/相机或文件解析，只有手动文本和已选JSON备份读取。

来源：
- https://developers.weixin.qq.com/miniprogram/dev/api/media/image/wx.chooseMessageFile.html
- https://developers.weixin.qq.com/miniprogram/dev/api/file/wx.openDocument.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/visionkit/ocr.html
- https://developers.weixin.qq.com/miniprogram/dev/api/ai/visionkit/VKSession.runOCR.html

## 5. 录音、转写与语音播放

- `getRecorderManager` 是全局录音管理器；start文档单次最大600000ms（10分钟），默认60000ms；不可说支持单次无限课堂录音。
- frameSize分片参数本次文档写mp3/pcm支持；语音/视频聊天可引起中断，需监听pause/stop/error/interruption。
- scope.record、微信宿主麦克风权限和隐私指引是不同层面，拒绝后仍允许打字。
- 持续锁屏/后台录音、分片回调和上传的跨端保证本次未核实；不当作产品承诺。API可录音也不自带完整ASR服务。
- 普通音频播放可使用InnerAudioContext，不再使用应destroy；后台音频需声明与审核，不能拿来保持AI/计时常驻。
- ASR/TTS供应商、插件资质/费用/额度未选定，不承诺免费配额。Android系统TextToSpeech没有可直接搬运的同一接口。

来源：
- https://developers.weixin.qq.com/miniprogram/dev/api/media/recorder/RecorderManager.start.html
- https://developers.weixin.qq.com/miniprogram/dev/api/media/recorder/RecorderManager.onFrameRecorded.html
- https://developers.weixin.qq.com/miniprogram/dev/api/media/recorder/RecorderManager.onInterruptionBegin.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/authorize.html
- https://developers.weixin.qq.com/miniprogram/dev/api/media/audio/wx.createInnerAudioContext.html
- https://developers.weixin.qq.com/miniprogram/dev/api/media/background-audio/wx.getBackgroundAudioManager.html

## 6. AI流式与服务器通信

`wx.request(enableChunked)` + `RequestTask.onChunkReceived` 是可用路径，接收ArrayBuffer，不是浏览器EventSource。参数表与事件页分别列2.20.2/2.20.1起，需检查实际组合。

- 处理UTF-8多字节跨块、半条/多条消息、顺序、取消和恢复；一个网络chunk不等于一个token或消息。
- 聚合输出再setData，不能每个token重渲染整个页面；后端代理不能缓冲完才吐出。
- 不支持时降级非流式/异步任务，不伪造AI答案。
- 普通HTTPS请求、上传、下载、WebSocket各自配置合法域名；HTTPS/WSS、可信完整证书链、匹配域名与端口，普通公网域名不能localhost/IP。
- 微信网络指南要求服务器域名ICP备案，TLS支持1.2及以上。开发工具关闭域名校验不代替正式配置。
- 默认请求超时60秒；指南写request/uploadFile/downloadFile最大并发10个、connectSocket5个。本报告不推导未明确的共享池调度或无限连接时长。
- success回调仍需检查HTTP statusCode和业务错误；Referer由平台设置；`api.weixin.qq.com`服务端接口不能直接放前端。
- AI/API密钥、AppSecret留后端；技术能请求不代表个人主体取得AI服务资格。
- 微信另有“小程序AI开发模式beta”页面，本次仍写内测与暂不开放相关代码提审；它不是普通自有网关接入的通用上线许可，也非首版必要依赖。

来源：
- https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html
- https://developers.weixin.qq.com/miniprogram/dev/api/network/request/RequestTask.onChunkReceived.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html
- https://developers.weixin.qq.com/miniprogram/dev/ai/guide.html

## 7. 存储、包体和可靠备份

本轮官方页面口径：

| 类别 | 文档条件 | 本项目处理 |
|---|---|---|
| 普通storage | 单key1MB、总10MB；用户删除或空间清理可丢失 | 首版单快照严格750KiB，写失败不报成功 |
| 加密storage | 文档提示数据膨胀，相应约0.7MB/key、7.1MB总量 | 首版未声称加密；不是无代价密钥保险箱 |
| 用户文件+缓存 | 当前指南合计200MB；临时路径只有当前生命周期保证 | 只生成用户主动请求的JSON备份，明确沙箱残留 |
| 代码包 | 当前分包页：单主包/分包2M，合计30M；服务商代开发20M | 单主包；不塞模型、PDF、录音；脚本源大小不是正式wxapkg大小 |

文档口径可能随端/基础库和政策更新，不能混加storage/文件/包配额。异常处理和实际工具结果优先。

备份设计：

- schema版本、稳定ID外键、白名单字段、枚举/日期/关系/数量/字节限额；任何文件内容都是不可信数据。
- 验证再合并，不先删除旧库；冲突拒绝。多key并不天然事务，后续分片需版本化提交策略。
- `shareFileMessage` 需要用户点击。本版采用**生成文件→另一次点击选择会话保存**两步，不在长异步处理后擅自发文件。
- `saveFileToDisk` 仅PC，不在手机上声称“已存Downloads”。剪贴板不当作无限容量安全备份通道。
- 仅写入本机沙箱不等于异地备份；必须用户实际保存到可恢复位置。分享未加密文件前明示内容与回收站。
- 首版回收站不自动清空；容量不足明确失败。后续扩展应有可恢复迁移，不能为了腾空间悄悄永久删除用户资料。

来源：
- https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorage.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/ability/storage.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/ability/file-system.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages.html
- https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html
- https://developers.weixin.qq.com/miniprogram/dev/api/file/wx.saveFileToDisk.html

## 8. 性能与发布验收

本轮没有测出帧率或真机还原度。建议：

1. 固定样本数据与场景，低/中/高Android和iOS记录系统、微信、基础库、renderer、设备温度/刷新率。
2. 分开冷启动、热路由、输入延迟、滚动和动画；观察p50/p95/p99、慢帧占比与连续卡顿，不只平均FPS。
3. 点击反馈p95≤100ms、热路由内容可交互p95≤300ms可作目标，但不是当前结果；60Hz对应16.7ms只是帧预算。
4. `wx.getPerformance` 的appLaunch/route/firstRender等口径与端覆盖不同，不是通用FPS仪；不同粒度指标不能直接相加。
5. 记录setData次数/字节、节点量、同步存储与JSON解析耗时。大文本和本地快照应避免每帧序列化。
6. Skyline支线用官方UI/raster性能叠层及缓存重绘诊断，同设备同数据A/B，收益真实且降级通过才采用。
7. 模板编译、Node逻辑测试、IDE模拟器、真机、后台主体资格是五个不同验证层级，不能互相替代。

来源：
- https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/env.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/performance/perf_data.html
- https://developers.weixin.qq.com/miniprogram/dev/api/base/performance/PerformanceEntry.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/debug.html

## 9. 尚待真实账号/设备确认

- 个人AppID实际可选类目、订阅模板、文件/音频/AI相关资格和认证费用。
- Skyline跨端完整版本矩阵、实际渲染器命中与降级。
- OCR语言/公式/离线/设备覆盖，以及长录音后台连续性。
- 供应商配额/付费/数据处理合同、生成式AI材料及应用侧合规。
- 微信文件分享/选择的真实移动端体验与隐私后台声明。
- Android与小程序FSRS参数、时区/跨日和同步迁移一致性（首版未移植FSRS）。

工程决策：可做可靠的本地学习工具；AI、OCR、语音、Skyline逐项有条件扩展；不承诺完整Android等价迁移、后台任意保活或个人H5套壳。
