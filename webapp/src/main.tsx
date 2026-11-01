import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

const subtitles = ["知行合一", "学而时习之，不亦说乎", "温故而知新"];

function Header() {
  const subtitle = subtitles[new Date().getDate() % subtitles.length];
  return (
    <header className="app-header">
      <h1 className="app-title">知习</h1>
      <span className="app-subtitle">{subtitle}</span>
    </header>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="app-shell">
      <Header />
      <App />
    </div>
  </React.StrictMode>,
);
