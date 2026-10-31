import { useState } from 'react'
import Reveal from '../components/site/Reveal'
import { CURRENT_RELEASE } from '../lib/release'

const FAQS = [
  {
    q: '课堂录音会被上传吗？',
    a: '离线听课的语音识别在手机本地完成，原始录音默认不保存。你主动开启云端听课、导入音频或使用 Voice Typing 时，所选音频会经知习服务器转发给 Lecsync；云端录音默认不保存，主动开启云端保留后才保留 30 天，可通过云端任务删除。翻译、文档解析和 AI 学习包则会按功能处理相应文本或页图。',
  },
  {
    q: '哪些功能需要联网？断网了怎么办？',
    a: '模型下载、云端听课、音频转写、Voice Typing、AI 翻译、文档解析和 AI 学习包需要联网。离线模型下载完成后，本地识别不需要持续联网；断网时翻译任务可排队等待，录音与原文保存不受影响。云端功能则需要网络恢复后再使用。',
  },
  {
    q: '为什么提示需要激活试用额度？',
    a: '离线听课、本机识别、已有课堂和复习内容都不需要账号。AI 学习包、翻译、云端听课和文档解析需要管理员先在运营后台添加你的手机号，然后在 App 的「设置 → 试用额度」输入手机号激活。手机号只用于额度与设备绑定，不用于登录、营销或课堂内容关联。',
  },
  {
    q: '一个手机号可以几台设备？额度怎么算？',
    a: '默认一个手机号可绑定 3 台设备，管理员可按人调整；多台设备共用同一份每日额度。AI 学习包、云端音频分钟、翻译字符和文档解析分别计数，额度每天按北京时间 0 点重置；有效期结束后需要管理员续期，离线功能仍可继续使用。',
  },
  {
    q: '为什么首次离线听课前要下载模型？',
    a: `知习 v${CURRENT_RELEASE.version} release 安装包不内置离线识别模型。首次使用离线听课前，请在设置中联网下载并完成模型校验；之后可在本机识别。模型可卸载并移入应用内回收站，需要时恢复或重新下载，不会因此删除学习记录。`,
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
    a: '可能与系统后台限制、麦克风权限、资源状态或机型策略有关。请按 App 内保活引导允许自启动、调整电池优化并锁定后台卡片，同时确认前台服务通知仍在。不同机型表现会有差异，长课前请先短时测试，不保证所有系统环境下都能无中断录制。',
  },
  {
    q: '支持 iOS 吗？',
    a: `目前只有 Android 版本，知习 v${CURRENT_RELEASE.version} 需要 ${CURRENT_RELEASE.minAndroidShort} 和 ${CURRENT_RELEASE.abi} 设备。iOS 端会根据 Android 版的反馈情况评估，暂无时间表。`,
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
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span style={{ fontSize: 15.5, fontWeight: 800 }}>{q}</span>
          <span
            className="shrink-0 flex items-center justify-center rounded-full transition-transform duration-500"
            style={{
              width: 30, height: 30,
              background: open ? 'var(--brand)' : 'var(--section)',
              color: open ? '#fff' : 'var(--ink)',
              transform: open ? 'rotate(45deg)' : 'none',
              fontSize: 17, fontWeight: 400,
            }}
          >
            +
          </span>
        </button>
        <div
          className="grid transition-all duration-500"
          style={{
            gridTemplateRows: open ? '1fr' : '0fr',
            transitionTimingFunction: 'cubic-bezier(0.62, 0.05, 0.01, 0.99)',
          }}
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
      <section className="radar-bg">
        <div className="container-x pt-16 pb-14 lg:pt-24">
          <Reveal>
            <p className="mono-label mono-label--brand">FEEDBACK & FAQ</p>
            <h1 className="display mt-5" style={{ fontSize: 'clamp(36px, 5vw, 58px)' }}>
              你的每句吐槽，
              <br />
              都会变成下一个版本。
            </h1>
          </Reveal>
        </div>
      </section>

      <section className="hairline-t" style={{ background: 'var(--surface)' }}>
        <div className="container-x py-16">
          <Reveal className="max-w-md mx-auto">
            <div className="feature-cell rounded-3xl flex flex-col items-center text-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-8 8c-1.2 0-2.4-.3-3.4-.7L4 20l.9-4.2A7.6 7.6 0 0 1 4 12a8 8 0 0 1 8-8 8 8 0 0 1 9 8Z" transform="translate(-1 0)"/><path d="M8.5 11h.01M12.5 11h.01M16.5 11h.01"/></svg>
              <p className="mt-5" style={{ fontSize: 17, fontWeight: 800 }}>问题反馈</p>
              <p className="body-2 mt-2" style={{ fontSize: 13.5 }}>功能建议、Bug 反馈、使用吐槽，点下面的按钮告诉我们。</p>
              <a
                href="https://f.wps.cn/g/0a5SZG2s/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary mt-6"
                style={{ padding: '12px 30px', fontSize: 14 }}
              >
                填写反馈
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
              </a>
            </div>
          </Reveal>

          <div className="mt-20 max-w-3xl">
            <Reveal>
              <p className="mono-label">FAQ</p>
              <h2 className="display mt-4 mb-8" style={{ fontSize: 'clamp(26px, 3.2vw, 36px)' }}>常见问题</h2>
            </Reveal>
            <div className="flex flex-col gap-3">
              {FAQS.map((f, i) => (
                <FaqItem key={f.q} q={f.q} a={f.a} delay={i * 0.04} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
