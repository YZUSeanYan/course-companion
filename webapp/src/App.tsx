import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import ClassroomPage from "./pages/ClassroomPage";
import LearningPage from "./pages/LearningPage";
import CourseDetailPage from "./pages/CourseDetailPage";
import ReviewPage from "./pages/ReviewPage";
import SettingsPage from "./pages/SettingsPage";
import PrivacyPage from "./pages/PrivacyPage";

const NAV_ITEMS = [
  { to: "/", label: "听课" },
  { to: "/learning", label: "学习" },
  { to: "/review", label: "复习" },
  { to: "/settings", label: "设置" },
];

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route
          path="*"
          element={
            <>
              <Routes>
                <Route path="/" element={<ClassroomPage />} />
                <Route path="/learning" element={<LearningPage />} />
                <Route path="/learning/course/:courseId" element={<CourseDetailPage />} />
                <Route path="/review" element={<ReviewPage />} />
                <Route path="/review/:type" element={<ReviewPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
              <nav className="bottom-nav">
                {NAV_ITEMS.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </>
          }
        />
      </Routes>
    </HashRouter>
  );
}
