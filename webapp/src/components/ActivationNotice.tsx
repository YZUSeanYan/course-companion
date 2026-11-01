// 额度相关失败的内联提示：给出可执行的说明，并在需要激活时提供直达设置页的入口。
// 网页版不引导用户去安装 Android App——激活本身在「设置 → 试用额度」内即可完成。

import { Link } from "react-router-dom";

export default function ActivationNotice({ text, needsActivation }: { text: string; needsActivation: boolean }) {
  return (
    <p className="muted" style={{ marginBottom: 0 }}>
      {text}
      {needsActivation && (
        <>
          {" "}
          <Link to="/settings" style={{ color: "var(--accent-deep)", fontWeight: 700 }}>
            去激活试用额度 →
          </Link>
        </>
      )}
    </p>
  );
}
