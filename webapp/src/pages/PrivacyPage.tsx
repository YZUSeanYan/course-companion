// 隐私政策（网页版摘要版）。正式条款以官网 /privacy 为准，本页说明网页版差异点。

import { Link } from "react-router-dom";

export default function PrivacyPage() {
  return (
    <main>
      <Link className="backlink" to="/settings">
        ← 返回设置
      </Link>
      <h1 className="page-title">隐私政策（网页版）</h1>
      <div className="glass-card">
        <h2 style={{ fontSize: 15, marginTop: 0 }}>我们收集什么</h2>
        <p className="card-desc">
          网页版不要求注册账号。浏览器会生成一个匿名设备 ID 用于统计额度；如需使用 AI / 云端功能，
          需要管理员发放手机号试用额度：手机号在服务端加密存储、界面只显示脱敏号码、不用于营销，可联系管理员删除。
        </p>
        <h2 style={{ fontSize: 15 }}>本地存储</h2>
        <p className="card-desc">
          课堂转写、学习内容、复习卡与录音（如开启存档）保存在你浏览器的 IndexedDB 中，
          换浏览器或清除站点数据后会丢失；服务器不保存课堂正文与讲义内容。
        </p>
        <h2 style={{ fontSize: 15 }}>云端处理</h2>
        <p className="card-desc">
          AI 学习包、翻译、文档解析与云端听课经由自建网关转发给模型提供方处理；网关只记录请求元数据
          （时间、接口、状态码、耗时），不记录课堂正文、讲义内容或请求参数。
        </p>
        <h2 style={{ fontSize: 15 }}>麦克风</h2>
        <p className="card-desc">
          云端听课需要浏览器麦克风权限；音频仅在页面处于前台时采集，锁屏或切换标签页后采集会暂停或停止。
        </p>
        <p className="muted">完整条款（含 Android 端、提供方、未成年人等内容）见官网隐私政策页面。</p>
      </div>
    </main>
  );
}
