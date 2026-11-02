// 课堂小窗（Document Picture-in-Picture）的打开/关闭与样式镜像。
//
// 只有桌面 Chromium 116+ 支持 Document PiP；手机浏览器与 Safari/Firefox 没有。
// 必须在用户点击的同一手势里调用 requestWindow，否则会被拒绝。

import { createRoot, type Root } from "react-dom/client";
import ClassroomMini from "../components/classroom/ClassroomMini";

interface DocumentPipApi {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  readonly window: Window | null;
}

interface PipSession {
  window: Window;
  root: Root;
}

let active: PipSession | null = null;

function pipApi(): DocumentPipApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { documentPictureInPicture?: DocumentPipApi }).documentPictureInPicture ?? null;
}

export function supportsClassroomPip(): boolean {
  return pipApi() != null;
}

/** 把主文档的样式（外链与内联）复制到小窗，保证品牌色、字号与主页面一致。 */
function mirrorStyles(pipWindow: Window): void {
  const head = pipWindow.document.head;
  // 生产构建用相对路径（base: './'），小窗文档是 about:blank，必须给个 base 才能解析。
  const base = pipWindow.document.createElement("base");
  base.href = window.location.href;
  head.appendChild(base);

  const charset = pipWindow.document.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  head.appendChild(charset);

  for (const node of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) {
    const clone = node.cloneNode(true) as HTMLElement;
    // link.href 在 DOM 上是绝对地址；直接克隆属性会保留相对的 ./assets/...。
    if (clone instanceof HTMLLinkElement && node instanceof HTMLLinkElement) {
      clone.href = node.href;
    }
    head.appendChild(clone);
  }
}

/**
 * 打开课堂小窗。已打开时只聚焦，不重复创建。
 * 失败（非用户手势、浏览器策略）会抛出，由调用方提示。
 */
export async function openClassroomPip(options: { onReturn: () => void }): Promise<boolean> {
  const api = pipApi();
  if (!api) return false;

  const existing = api.window ?? active?.window ?? null;
  if (existing && !existing.closed) {
    existing.focus();
    return true;
  }

  const pipWindow = await api.requestWindow({ width: 380, height: 500 });
  mirrorStyles(pipWindow);
  pipWindow.document.title = "知习 · 课堂小窗";
  pipWindow.document.documentElement.lang = "zh-CN";
  pipWindow.document.body.className = "pip-body";

  const container = pipWindow.document.createElement("div");
  container.id = "classroom-pip-root";
  pipWindow.document.body.appendChild(container);

  const root = createRoot(container);
  root.render(
    <ClassroomMini
      pipWindow={pipWindow}
      onReturn={() => {
        try {
          window.focus();
        } catch {
          // 浏览器可能拒绝聚焦
        }
        options.onReturn();
      }}
    />,
  );
  active = { window: pipWindow, root };

  pipWindow.addEventListener("pagehide", () => {
    // 先清引用再卸载：关闭过程中 React 的清理逻辑仍可能订阅快照。
    if (active?.window === pipWindow) active = null;
    root.unmount();
  });

  return true;
}
