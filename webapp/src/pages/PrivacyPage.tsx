// 隐私政策（网页版摘要版）。正式条款以官网 /privacy 为准，本页说明网页版差异点。
// 网页端形态：阅读型长文，正文限宽到 68ch，条款按小节分组。

import { Link } from "react-router-dom";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "我们收集什么",
    body:
      "网页版不要求注册账号。浏览器会生成一个匿名设备 ID 用于统计额度；如需使用 AI / 云端功能，需要管理员发放手机号试用额度：手机号在服务端加密存储、界面只显示脱敏号码、不用于营销，可联系管理员删除。",
  },
  {
    title: "本地存储",
    body:
      "课堂转写、学习内容、复习卡与录音（如开启存档）保存在你浏览器的 IndexedDB 中，换浏览器或清除站点数据后会丢失；服务器不保存课堂正文与讲义内容。",
  },
  {
    title: "云端处理",
    body:
      "AI 学习包、翻译、文档解析与云端听课经由自建网关转发给模型提供方处理；网关只记录请求元数据（时间、接口、状态码、耗时），不记录课堂正文、讲义内容或请求参数。",
  },
  {
    title: "麦克风",
    body:
      "云端听课需要浏览器麦克风权限；音频仅在页面处于前台时采集，锁屏或切换标签页后采集会暂停或停止。",
  },
];

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Privacy</p>
          <h2>网页版差异说明</h2>
          <p>只说明网页版与 App 的差异点；完整条款见官网隐私政策页面。</p>
        </div>
      </div>

      <div className="glass-card">
        {SECTIONS.map((section, index) => (
          <div key={section.title} style={{ marginTop: index === 0 ? 0 : 18, paddingTop: index === 0 ? 0 : 18, borderTop: index === 0 ? "none" : "1px solid var(--line-soft)" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700 }}>
              <span style={{ color: "var(--brand)", fontVariantNumeric: "tabular-nums", marginRight: 8 }}>
                {String(index + 1).padStart(2, "0")}
              </span>
              {section.title}
            </h3>
            <p className="card-desc" style={{ marginBottom: 0, maxWidth: "68ch" }}>
              {section.body}
            </p>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <Link className="btn btn-sm" to="/settings">
          ← 返回设置
        </Link>
      </div>
    </div>
  );
}
