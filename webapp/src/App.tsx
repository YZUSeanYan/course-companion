import { useEffect, useRef, useState } from "react";
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import ClassroomPage from "./pages/ClassroomPage";
import LearningPage from "./pages/LearningPage";
import CourseDetailPage from "./pages/CourseDetailPage";
import ReviewPage from "./pages/ReviewPage";
import SettingsPage from "./pages/SettingsPage";
import PrivacyPage from "./pages/PrivacyPage";
import { BookIcon, CardsIcon, ChevronLeftIcon, MicIcon, SettingsIcon } from "./components/layout/NavIcons";
// 与 App 启动图标同源：app/src/main/res/drawable-nodpi/ic_brand_square.png
import appIcon from "./assets/app-icon.png";

/** 与 Android RootPageOrder 一致的四个根入口。 */
const NAV_ITEMS = [
  { to: "/", label: "听课", en: "Listen", icon: MicIcon },
  { to: "/learning", label: "学习", en: "Study", icon: BookIcon },
  { to: "/review", label: "复习", en: "Review", icon: CardsIcon },
  { to: "/settings", label: "设置", en: "Settings", icon: SettingsIcon },
];

const MOTTOS = ["知行合一", "学而时习之，不亦说乎", "温故而知新"];

interface Chrome {
  /** 顶栏主标题。 */
  title: string;
  /** 顶栏副标题：首页由 <MottoText /> 接管轮换，其余页给一句功能定位。 */
  subtitle: string;
  /** 有值则顶栏出现返回按钮。 */
  back?: string;
}

function chromeFor(pathname: string): Chrome {
  if (pathname === "/") return { title: "听课", subtitle: "" };
  if (pathname === "/learning") return { title: "学习", subtitle: "课程 · 讲义 · 学习包" };
  if (pathname.startsWith("/learning/course/")) return { title: "课程详情", subtitle: "分类内容与讲义", back: "/learning" };
  if (pathname === "/review") return { title: "复习", subtitle: "间隔重复 · 今日到期" };
  if (pathname.startsWith("/review/")) return { title: "复习", subtitle: "逐张过关", back: "/review" };
  if (pathname === "/settings") return { title: "设置", subtitle: "账号 · 设备 · 服务" };
  if (pathname === "/privacy") return { title: "隐私政策", subtitle: "网页版说明", back: "/settings" };
  return { title: "知习", subtitle: "网页版" };
}

/** 首页标语每 5 秒轮换一次，与 Android 端一致。
 *  只在首页挂载（见 TopBar），避免定时器把整个外壳与页面子树一起重渲染。 */
function MottoText() {
  const [index, setIndex] = useState(() => new Date().getDate() % MOTTOS.length);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % MOTTOS.length), 5000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{MOTTOS[index % MOTTOS.length]}</>;
}

function SideRail() {
  return (
    <aside className="rail" aria-label="主导航">
      {/* 图标轨形态下 .rail__name 被隐藏、图标本身 aria-hidden，必须靠 aria-label 保住可访问名称 */}
      <Link className="rail__brand" to="/" aria-label="知习">
        <span className="rail__mark" aria-hidden>
          <img src={appIcon} alt="" width={34} height={34} />
        </span>
        <span className="rail__name">
          <b>知习</b>
          <span>Zhixi</span>
        </span>
      </Link>

      <p className="rail__label" aria-hidden>
        学习台
      </p>
      <nav className="rail__nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => `rail__link${isActive ? " active" : ""}`}
              title={item.label}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="rail__foot">
        <Link className="rail__link" to="/privacy" title="隐私政策">
          <BookIcon size={16} />
          <span>隐私政策</span>
        </Link>
        <p className="rail__meta">
          云端听课 · AI 学习包
          <br />
          数据保存在本浏览器
        </p>
      </div>
    </aside>
  );
}

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            <Icon size={20} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function TopBar({ chrome, isHome }: { chrome: Chrome; isHome: boolean }) {
  return (
    <header className="topbar">
      {chrome.back ? (
        <Link className="topbar__back" to={chrome.back} aria-label="返回">
          <ChevronLeftIcon size={16} />
        </Link>
      ) : null}
      <div className="topbar__title">
        <h1>{chrome.title}</h1>
        <span>{isHome ? <MottoText /> : chrome.subtitle}</span>
      </div>
    </header>
  );
}

function Shell() {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const chrome = chromeFor(location.pathname);

  // 路由切换：回到页顶；若焦点随即将卸载的元素一起消失（如顶栏返回按钮），转交给主区，
  // 否则键盘用户的 Tab 顺序会从文档开头重新走一遍。
  const mainRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    const active = document.activeElement;
    const lost = !active || active === document.body || !document.contains(active);
    if (lost) mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="app">
      <SideRail />
      <div className="app__main">
        <TopBar chrome={chrome} isHome={isHome} />
        <div className="page page-enter" key={location.pathname} ref={mainRef} tabIndex={-1}>
          <Routes>
            <Route path="/" element={<ClassroomPage />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/learning/course/:courseId" element={<CourseDetailPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/review/:type" element={<ReviewPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
          </Routes>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
