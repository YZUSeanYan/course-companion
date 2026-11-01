import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

// 标签页 / 主屏图标写在 index.html 里（public/favicon.*），用相对路径适配 /web/ 子路径，
// 脚本还没启动时也能显示正确图标。这里只负责挂载应用。
// 外壳（左栏 / 顶栏 / 底部导航）在 App 内部渲染：路由需要在 HashRouter 之下才能取到 pathname。
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
