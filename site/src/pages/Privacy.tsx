import type { ReactNode } from 'react'
import Reveal from '../components/site/Reveal'
import PageHero from '../components/site/PageHero'
import { CURRENT_RELEASE } from '../lib/release'

const PERMISSIONS = [
  { p: '麦克风', use: '录制课堂声音，用于本地或云端语音识别、音频转写与 Voice Typing', required: '录音功能必需' },
  { p: '通知', use: '显示前台录音状态、学习包生成与复习提醒', required: '相应提醒必需' },
  { p: '前台服务（麦克风类型）', use: '在录音过程中持续运行前台录音与识别服务', required: '持续录音必需' },
  { p: '网络', use: '模型下载、云端听课、音频转写、Voice Typing、翻译、文档解析与 AI 学习包', required: '相应联网功能必需' },
  { p: '震动', use: '疑问标记与提醒时的震动反馈', required: '可在设置中关闭' },
  { p: '唤醒锁', use: '降低录音过程中 CPU 休眠导致中断的可能', required: '持续录音必需' },
]

const NO_PERMISSIONS = ['定位', '通讯录', '短信', '相机', '全盘存储', '悬浮窗', '读取应用列表']

const TOC = [
  { id: 'local', label: '本地数据与模型' },
  { id: 'network', label: '哪些功能会联网' },
  { id: 'account', label: '设备凭据与试用额度' },
  { id: 'permissions', label: '权限说明' },
  { id: 'retention', label: '保留与删除' },
  { id: 'third-party', label: '第三方组件' },
  { id: 'terms', label: '使用条款' },
  { id: 'minors', label: '课堂授权与未成年人' },
  { id: 'choices', label: '你的选择' },
  { id: 'contact', label: '联系我们' },
]

function H2({ id, children }: { id?: string; children: ReactNode }) {
  return <h2 id={id}>{children}</h2>
}

function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>
}

export default function Privacy() {
  return (
    <div className="page-enter">
      <PageHero
        eyebrow="PRIVACY POLICY"
        title="隐私政策与使用条款"
        lead={`版本：2026 年 11 月版 · 生效日期：2026 年 11 月 1 日 · 适用于「知习」Android 应用 v${CURRENT_RELEASE.version} 与知习网页版。`}
      />

      <section className="band band--surface">
        <div className="container-x section">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_208px] lg:gap-16">
          <div className="prose">
            <Reveal>
              <div className="summary-card">
                <strong>一句话版本：</strong>本地优先不等于所有功能都离线。离线听课在设备端识别，原始录音默认不保存；
                你主动使用云端听课、音频转写或 Voice Typing 时，所选音频会经知习服务器转发给 Lecsync；
                翻译、文档解析和 AI 学习包则按功能处理相应文本或页图。网页版不提供离线识别，只使用云端能力。
              </div>
            </Reveal>

            <H2 id="local">一、本地课堂数据与模型</H2>
            <P>
              1. <strong>离线听课在设备端识别。</strong>release 安装包不内置离线识别模型。首次离线听课前需在设置中联网下载并校验模型；
              模型就绪后，语音识别在本地完成，不需要持续联网。网页版不提供该能力。
            </P>
            <P>
              2. <strong>原始录音默认不保存。</strong>离线识别后的音频流默认不保留；如你主动开启保存录音，
              音频文件仅存储于应用私有目录，供你回放与导出。云端听课或云端音频转写属于主动选择的联网处理，不适用“纯本地”描述。
            </P>
            <P>
              3. <strong>学习记录默认保存在本机。</strong>转写、课程、手动疑问、复习记录与已导入文件默认存于应用私有目录；
              网页版使用浏览器本地数据库（IndexedDB）保存同类记录，清除浏览器数据会一并删除。
            </P>
            <P>
              4. <strong>录音与资料使用须取得许可。</strong>录制教师或同学声音、上传教材或分享课堂资料前，请取得必要许可并遵守学校规定；
              禁止录音或涉密场所请勿使用。
            </P>

            <H2 id="network">二、哪些功能会联网</H2>
            <P>以下功能会产生网络请求。云端听课、音频上传、文档解析等需由你主动选择或确认，模型下载也需要你发起：</P>
            <P>
              1. <strong>模型下载：</strong>下载、更新或恢复需要重新获取的离线识别模型时，会联网接收模型文件并进行完整性与 SHA-256 校验。
            </P>
            <P>
              2. <strong>云端听课、音频导入与 Voice Typing：</strong>你主动开启云端听课、导入音频或使用 Voice Typing 后，
              所选音频会经知习服务器转发给 <strong>Lecsync</strong>，用于实时或文件转写、翻译、说话人区分、术语、AI 润色、实时纪要或 Voice Typing。
            </P>
            <P>
              3. <strong>实时翻译：</strong>开启后，定稿字幕文本可能发送给 <strong>Lecsync、DeepSeek、Kimi 或 MiMo</strong>，按可用性顺序处理。
              网络失败时翻译可排队等待，本地录音与原文保存不因此停止。
            </P>
            <P>
              4. <strong>AI 学习包：</strong>生成学习纪要、词汇、重难点、自测卡或参考解答时，
              相关字幕文本、手动疑问与课程信息会发送给所选模型服务。
            </P>
            <P>
              5. <strong>文档解析：</strong>复杂讲义经你确认后上传原文件，用于生成页图、OCR 与视觉分析；
              必要时会将<strong>页图与 OCR 文本上下文</strong>发送给视觉模型。
            </P>
            <P>
              Realtime 与音频转写按实际音频时长计量，文本翻译按源字符计量，Voice Typing 按最终文本字符计量；
              界面显示的用量以来源服务返回为准。不同提供方的隐私条款与数据所在地可能不同，请勿上传涉密或无权分享的内容。
            </P>

            <H2 id="account">三、匿名设备凭据、试用手机号、模型服务与安全</H2>
            <P>
              Android 应用与网页版都不需要注册账号，使用<strong>匿名设备令牌</strong>访问学习服务。
              App 的令牌通过 Android Keystore 加密保存在设备上；网页版的令牌保存在当前浏览器的本地存储中，清除浏览器数据即失效。
              匿名设备标识、访问令牌与调用配额用于服务鉴权、限流、故障恢复和云端用量对账。
              服务端可保存匿名设备、配额、任务与用量元数据，以及文档解析产生的页图和结构化结果。
            </P>
            <P>
              <strong>AI 学习包、翻译、云端听课和文档解析需要激活试用额度。</strong>
              手机号可由管理员在运营后台添加；也可以自助开通：在 App 或网页版的「设置 → 试用额度」输入手机号获取验证码，
              手机号还没有额度时会自动开通，验证通过后绑定当前设备。验证码由阿里云短信发送，手机号会提供给阿里云用于下发验证码。
              激活时手机号只发送给知习自己的额度网关，用于确认试用资格、绑定设备和统计每人每日额度，不用于登录、营销、通讯录匹配或课堂内容关联。
              手机号在服务端使用独立密钥加密保存，查找使用不可逆摘要；客户端只保留脱敏号码（如 138****1234）。
              管理员可在后台查看、更正、解绑或删除手机号；自助申请填写的姓名和昵称仅用于管理员识别与界面显示。
            </P>
            <P>
              <strong>模型密钥仅由服务端环境变量提供</strong>，不会打包进 APK，也不会下发到浏览器或手机。
              传输使用 HTTPS，正式发布版本禁止明文 HTTP；服务端限制访问地址、请求频率与重试次数，应用日志不记录讲义、字幕正文或手机号明文。
            </P>
            <P>
              任何系统都无法保证绝对安全，请妥善保管设备与导出文件。模型提供方的独立留存政策不由本应用控制。
            </P>

            <H2 id="permissions">四、权限说明（Android 应用）</H2>
            <P>Android 应用按功能申请以下权限。网页版只在你点击开始听课时请求浏览器的麦克风权限：</P>
            <div className="rows mb-6">
              {PERMISSIONS.map((r) => (
                <div key={r.p} className="rows__row" style={{ gridTemplateColumns: undefined }}>
                  <p className="rows__key">{r.p}</p>
                  <p className="rows__val">
                    {r.use}
                    <span style={{ color: 'var(--brand-deep)', fontWeight: 700 }}> · {r.required}</span>
                  </p>
                </div>
              ))}
            </div>
            <P>本应用<strong>不申请</strong>以下权限：</P>
            <div className="mb-6 flex flex-wrap gap-2">
              {NO_PERMISSIONS.map((p) => (
                <span key={p} className="pill">{p}</span>
              ))}
            </div>
            <P>
              音频、讲义与文档通过系统文件选择器导入，无需全盘存储权限。拒绝麦克风会限制录音相关功能；
              不下载离线模型会限制离线听课，但不影响已有课程与复习内容查看。
            </P>

            <H2 id="retention">五、导入、导出、保留与删除</H2>
            <P>
              1. <strong>本地内容：</strong>你可查看、复制、导出或删除本地课堂记录。卸载应用或清除浏览器数据后，相关本地数据库、私有录音、讲义和凭据会被清除。
              回收站中的模型文件可恢复，也可能继续占用空间；请按需要彻底清理或重新下载。
            </P>
            <P>
              2. <strong>可选 30 天云端录音：</strong>云端录音默认不保存。只有主动开启云端保留后，Lecsync 才将音频与转写保留 30 天。
              你可以通过云端任务<strong>下载或删除</strong>相应录音；删除后不可恢复。
            </P>
            <P>
              3. <strong>文本与短音频结果：</strong>文本翻译和短音频结果按提供方的有效期留存。
              Voice Typing 的最终文本不支持重放，应用会及时将其保存到本机。
            </P>
            <P>
              4. <strong>云端文档：</strong>主动上传解析后，服务端会保存对应页图与结构化解析结果，用于生成学习内容。
              现阶段不提供自助云端文档删除或恢复，请勿上传需要即时远程擦除的内容。
            </P>
            <P>
              5. <strong>试用手机号：</strong>手机号以加密形式保存在额度数据库中，只有管理员可在运营后台查看。
              自助申请填写的姓名和昵称用于管理员识别与界面显示，同样只有管理员可查看。
              不再使用试用额度时，可联系管理员解绑设备并删除手机号；删除后 AI/云端功能停止，离线听课不受影响。
            </P>

            <H2 id="third-party">六、第三方组件与 AI 内容</H2>
            <P>
              本应用使用 sherpa-onnx、Google ML Kit、PdfBox-Android、java-fsrs、Lecsync，以及 DeepSeek、Kimi、MiMo 等模型服务。
              ML Kit 不是开源组件；各组件、模型与服务适用其独立许可和条款。
            </P>
            <P>
              <strong>AI 翻译、纪要、词汇、视觉说明与参考解答可能存在错误或遗漏</strong>，应结合原页、原文和教师说明核对，
              不作为考试、评分或安全操作依据。
            </P>

            <H2 id="terms">七、使用条款</H2>
            <P>
              1. 本应用是<strong>个人学习辅助工具</strong>。请在你本人学习范围内使用课堂录音、转写与 AI 生成内容，
              不得传播、出售或用于其他未获授权的用途。
            </P>
            <P>
              2. 在明确禁止录音的课堂、会议或涉密场所，请遵守相关规定，不要使用本应用；你应确保对上传内容具有合法使用权。
            </P>
            <P>
              3. 本应用按「现状」提供。我们会持续改进识别与生成质量，但不对识别偏差、服务中断或 AI 生成内容导致的后果承担责任。
            </P>

            <H2 id="minors">八、课堂授权与未成年人</H2>
            <P>
              本应用不要求注册登录，不收集姓名或学号，也不收集通讯录、短信或精确位置。
              为管理试用额度，AI/云端功能会要求激活手机号；手机号只用于额度与设备绑定，不用于登录或营销。
              自助申请会收集昵称、（可选的）姓名和手机号，并通过阿里云短信发送验证码；这些信息只用于试用资格与管理员识别。
              未成年人应在监护人指导下使用，遵守学校管理规定，不得上传他人敏感信息。
            </P>

            <H2 id="choices">九、你的选择与政策更新</H2>
            <P>
              你可以不开通翻译或云端听课，不导入音频或讲义，也不生成 AI 学习包；也可卸载模型并恢复，或删除本地课堂记录。
              对本应用控制范围内的信息，可通过官网反馈渠道咨询访问、更正或删除事宜。
            </P>
            <P>
              如功能、处理方式或提供方发生变化，我们会更新本政策并标注版本日期；重大变化将在应用内以适当方式提示。
              继续使用更新后的相关功能，表示你已阅读并理解相应政策。
            </P>

            <H2 id="contact">十、联系我们</H2>
            <P>
              如对本政策或本应用的隐私实践有任何疑问，可通过
              <a href="/#/feedback">反馈页面</a>
              与我们联系。
            </P>
          </div>

          {/* 目录：长文右侧的固定导航，滚过标题前一直可见 */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-5">
              <p className="tagline" style={{ letterSpacing: '0.14em' }}>目录</p>
              <ul className="mt-3 flex flex-col gap-2" style={{ fontSize: 13, fontWeight: 600 }}>
                {TOC.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} className="hover:text-[var(--brand-deep)]" style={{ color: 'var(--ink-2)' }}>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
          </div>
        </div>
      </section>
    </div>
  )
}
