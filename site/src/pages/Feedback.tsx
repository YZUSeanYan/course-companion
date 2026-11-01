import { useState } from 'react'
import Reveal from '../components/site/Reveal'
import PageHero from '../components/site/PageHero'
import SectionHead from '../components/site/SectionHead'
import CtaBand from '../components/site/CtaBand'
import { CURRENT_RELEASE, WEB_APP_URL } from '../lib/release'

const FAQS = [
  {
    q: '网页版和 App 有什么区别？',
    a: `网页版在浏览器里运行，免安装，电脑、Android、iPhone / iPad 都能用：云端听课、导入讲义、AI 学习包、翻译与 FSRS 复习计划完整可用，也不需要安装 Android 包。Android App 额外提供「本地离线听课」——离线识别在设备端完成，模型按需下载。两者共用同一手机号的试用额度。`,
  },
  {
    q: '课堂录音会被上传吗？',
    a: '离线听课的语音识别在设备本地完成，原始录音默认不保存。你主动开启云端听课、导入音频或使用 Voice Typing 时，所选音频会经知习服务器转发给 Lecsync；云端录音默认不保存，主动开启云端保留后才保留 30 天，可通过云端任务删除。翻译、文档解析和 AI 学习包则会按功能处理相应文本或页图。',
  },
  {
    q: '哪些功能需要联网？断网了怎么办？',
    a: '模型下载、云端听课、音频转写、Voice Typing、AI 翻译、文档解析和 AI 学习包需要联网。离线模型下载完成后，本地识别不需要持续联网；断网时翻译任务可排队等待，录音与原文保存不受影响。云端功能则需要网络恢复后再使用。',
  },
  {
    q: '为什么提示需要激活试用额度？',
    a: '离线听课、本机识别、已有课堂和复习内容都不需要账号。AI 学习包、翻译、云端听课和文档解析需要先激活试用额度：在网页版或 App 的「设置 → 试用额度」输入手机号即可，手机号还没有额度时会自动开通，验证通过即完成激活，一次短信搞定，不需要先装 App。手机号只用于额度与设备绑定，不用于登录、营销或课堂内容关联。',
  },
  {
    q: '一个手机号可以几台设备？额度怎么算？',
    a: '默认一个手机号可绑定 3 台设备，管理员可按人调整；多台设备与网页版共用同一份每日额度。AI 学习包、云端音频分钟、翻译字符和文档解析分别计数，额度每天按北京时间 0 点重置；有效期结束后需要管理员续期，离线功能仍可继续使用。',
  },
  {
    q: '支持 iOS 吗？',
    a: '支持。iPhone / iPad 用浏览器打开网页版即可使用云端听课、讲义导入、AI 学习包与复习计划，激活也在网页版里完成，不需要 Android 手机。原生 iOS App 会根据使用反馈评估，暂无时间表。',
  },
  {
    q: '为什么首次离线听课前要下载模型？',
    a: `知习 v${CURRENT_RELEASE.version} release 安装包不内置离线识别模型。首次使用离线听课前，请在设置中联网下载并完成模型校验；之后可在本机识别。模型可卸载并移入应用内回收站，需要时恢复或重新下载，不会因此删除学习记录。网页版不提供离线识别，使用云端听课。`,
  },
  {
    q: '识别准确率怎么样？口音重的老师能用吗？',
    a: '可以尝试，但识别效果会受口音、教室噪声、语速、距离、麦克风与所选识别方式影响，不能保证每句话都准确。离线识别先快速显示、再生成定稿文本；建议正式上课前用相似环境测试，并结合原文、录音（如主动保存）和讲义核对重要内容。',
  },
  {
    q: 'AI 生成的纪要和疑问解答可信吗？',
    a: 'AI 生成内容可能存在遗漏或错误，仅供学习参考。知习优先保留课堂原文，并在学习包中整理纪要、词汇和参考解答；请结合课堂原文、讲义原页与教师说明核对，不要把生成结果当作唯一依据。',
  },
  {
    q: '一节 90 分钟的课，耗电和发热如何？',
    a: '耗电与发热会因机型、芯片、离线或云端识别、屏幕状态、网络质量和系统后台策略而变化，官网不提供未经验证的统一百分比。长时间上课前建议保持电量充足，先做一次短时测试，并避免高温环境或边充电边持续高负载使用。',
  },
  {
    q: '为什么录着录着就断了？',
    a: '可能与系统后台限制、麦克风权限、资源状态或机型策略有关。请按 App 内保活引导允许自启动、调整电池优化并锁定后台卡片，同时确认前台服务通知仍在。网页版请保持标签页在前台。不同环境表现会有差异，长课前请先短时测试。',
  },
  {
    q: '录老师讲课合规吗？',
    a: '知习是个人学习辅助工具。录制教师或同学声音、上传教材或分享课堂资料前，请取得必要许可并遵守学校规定；只在个人学习范围内使用，不要传播录音与转写内容。明确禁止录音或涉密的课堂、会议和场所请勿使用。',
  },
]

function FaqItem({ q, a, delay }: { q: string; a: string; delay: number }) {
  const [open, setOpen] = useState(false)
  return (
    <Reveal delay={delay}>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--ink)' }}>{q}</span>
          <span
            className="flex shrink-0 items-center justify-center rounded-full transition-transform duration-300"
            style={{
              width: 28,
              height: 28,
              background: open ? 'var(--brand)' : 'var(--section)',
              color: open ? '#fff' : 'var(--ink-2)',
              transform: open ? 'rotate(45deg)' : 'none',
              fontSize: 17,
              lineHeight: 1,
            }}
            aria-hidden
          >
            +
          </span>
        </button>
        <div
          className="grid transition-all duration-300"
          style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            <p className="body-2 px-6 pb-6" style={{ fontSize: 14 }}>{a}</p>
          </div>
        </div>
      </div>
    </Reveal>
  )
}

export default function Feedback() {
  return (
    <div className="page-enter">
      <PageHero
        eyebrow="FEEDBACK & FAQ"
        title={<>你的每句吐槽，<br /><span className="accent">都会变成下一个版本。</span></>}
        lead="功能建议、Bug 反馈、使用吐槽都欢迎。常见问题先看下面，没解决的再填反馈表。"
      />

      <section className="band band--surface">
        <div className="container-x section">
          <SectionHead
            index="01"
            eyebrow="CONTACT"
            title="问题反馈"
            lead="描述得越具体，修得越快：机型或浏览器版本、发生时间、当时的操作步骤。"
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Reveal className="h-full">
              <div className="card card--soft card--hover card--sheen h-full">
                <span className="card__icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a8 8 0 0 1-8 8c-1.2 0-2.4-.3-3.4-.7L4 20l.9-4.2A7.6 7.6 0 0 1 4 12a8 8 0 0 1 8-8 8 8 0 0 1 9 8Z" transform="translate(-1 0)" /><path d="M8.5 11h.01M12.5 11h.01M16.5 11h.01" /></svg>
                </span>
                <p className="h3 mt-4" style={{ fontSize: 17 }}>填写反馈表</p>
                <p className="small mt-2">功能建议、Bug、吐槽都可以写，我们按表单逐条看。</p>
                <a
                  href="https://f.wps.cn/g/0a5SZG2s/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--primary mt-5"
                >
                  打开反馈表
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                </a>
              </div>
            </Reveal>

            <Reveal delay={0.05} className="h-full">
              <div className="card card--soft card--hover card--sheen h-full">
                <span className="card__icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1 1-1.1 1.8v.3" /><path d="M12 17.2h.01" /></svg>
                </span>
                <p className="h3 mt-4" style={{ fontSize: 17 }}>先看常见问题</p>
                <p className="small mt-2">激活、离线模型、断线、iOS 支持等问题，下面大多有直接答案。</p>
                <a href="#faq" className="btn btn--ghost mt-5">跳到常见问题</a>
              </div>
            </Reveal>

            <Reveal delay={0.1} className="h-full">
              <div className="card card--soft card--hover card--sheen h-full">
                <span className="card__icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" /></svg>
                </span>
                <p className="h3 mt-4" style={{ fontSize: 17 }}>直接用网页版</p>
                <p className="small mt-2">免安装，iPhone / iPad 也能用；激活在网页版里就能完成。</p>
                <a href={WEB_APP_URL} className="btn btn--ghost mt-5">打开网页版</a>
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <div className="notice notice--muted mt-6">
              反馈不会收集你的课堂录音或讲义内容；如果问题与某节课有关，请在描述里用文字说明，不要附带真实课堂资料。
            </div>
          </Reveal>
        </div>
      </section>

      <section id="faq" className="band">
        <div className="container-x section">
          <SectionHead index="02" eyebrow="FAQ" title="常见问题" />
          <div className="mt-10 grid items-start gap-3 md:grid-cols-2">
            {FAQS.map((f, i) => (
              <FaqItem key={f.q} q={f.q} a={f.a} delay={(i % 2) * 0.04} />
            ))}
          </div>
        </div>
      </section>

      <CtaBand eyebrow="START NOW" />
    </div>
  )
}
