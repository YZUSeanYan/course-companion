import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import appIconUrl from "./assets/app-icon.png";

// 网页版图标直接复用 App 的启动图标（app/src/main/res/drawable-nodpi/ic_brand_square.png）。
// 构建产物挂在 /web/ 子路径下，而 vite base 是 './'，所以不能把图标写死在 index.html 里，
// 运行时用 Vite 重写过的 URL 生成 link 标签，路径才随部署位置变化。
function installIcons(url: string) {
  const links: Array<{ rel: string; type?: string; sizes?: string }> = [
    { rel: "icon", type: "image/png", sizes: "512x512" },
    { rel: "apple-touch-icon", sizes: "180x180" },
  ];
  for (const meta of links) {
    const link = document.createElement("link");
    link.rel = meta.rel;
    if (meta.type) link.type = meta.type;
    if (meta.sizes) link.sizes = meta.sizes;
    link.href = url;
    document.head.appendChild(link);
  }
}

installIcons(appIconUrl);

// 外壳（左栏 / 顶栏 / 底部导航）在 App 内部渲染：路由需要在 HashRouter 之下才能取到 pathname。
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
