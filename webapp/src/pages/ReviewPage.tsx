// 复习页：分类总览（今日到期/卡片总数）+ 翻面评分。FSRS 参数与 Android 一致。
// 路由 /review 为总览，/review/:type 进入该分类的连续复习。

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newUid, type ReviewCardRecord } from "../lib/db/db";
import { summarizeReviewCategories, learningTypeLabel } from "../lib/pack";
import { reviewCard, type ReviewRating } from "../lib/fsrs/scheduler";

const RATINGS: { value: ReviewRating; label: string }[] = [
  { value: 1, label: "忘了" },
  { value: 2, label: "困难" },
  { value: 3, label: "良好" },
  { value: 4, label: "简单" },
];

export default function ReviewPage() {
  const { type } = useParams();
  const navigate = useNavigate();
  const cards = useLiveQuery(() => db.reviewCards.toArray(), []);
  const now = Date.now();
  const summaries = useMemo(
    () => summarizeReviewCategories(cards ?? [], now),
    [cards, now],
  );

  if (!type) {
    const total = (cards ?? []).length;
    const due = (cards ?? []).filter((card) => card.dueAtMillis <= now).length;
    return (
      <main>
        <h1 className="page-title">复习</h1>
        <div className="glass-card">
          <div className="card-title">
            复习总览
            <span className="pill">{due > 0 ? `今日到期 ${due}` : "今日无到期"}</span>
          </div>
          <p className="card-desc">共 {total} 张卡片。到期卡片可跨分类连续复习。</p>
          {due > 0 && (
            <div className="btn-row" style={{ marginTop: 0 }}>
              <button className="btn btn-primary" onClick={() => navigate("/review/all")}>
                全部到期（{due}）
              </button>
            </div>
          )}
        </div>
        <div className="category-grid">
          {summaries.map((summary) => (
            <div className="glass-card" key={summary.type} style={{ marginBottom: 0 }}>
              <div className="card-title">
                {summary.label}
                <span className={`pill ${summary.due > 0 ? "pill-ok" : ""}`}>{summary.due > 0 ? `到期 ${summary.due}` : "无到期"}</span>
              </div>
              <p className="card-desc">{summary.description}</p>
              <div className="muted">共 {summary.total} 张{summary.nextDueAtMillis ? ` · 下次 ${new Date(summary.nextDueAtMillis).toLocaleString("zh-CN")}` : ""}</div>
              <div className="btn-row">
                <button className="btn btn-sm" onClick={() => navigate(`/review/${summary.type}`)}>
                  开始复习
                </button>
              </div>
            </div>
          ))}
        </div>
        {summaries.length === 0 && (
          <div className="glass-card">
            <p className="card-desc" style={{ marginBottom: 0 }}>
              还没有复习卡片。词汇、短语、自测问答与练习会在生成学习包时自动进入复习。
            </p>
          </div>
        )}
      </main>
    );
  }

  return <ReviewSession type={type} />;
}

function ReviewSession({ type }: { type: string }) {
  const navigate = useNavigate();
  const cards = useLiveQuery(() => db.reviewCards.toArray(), []);
  const now = Date.now();
  const dueCards = useMemo(() => {
    const pool = (cards ?? []).filter((card) => card.dueAtMillis <= now);
    const selected = type === "all" ? pool : pool.filter((card) => card.itemType === type);
    return selected.sort((a, b) => a.dueAtMillis - b.dueAtMillis);
  }, [cards, now, type]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saved, setSaved] = useState(0);

  const current: ReviewCardRecord | undefined = dueCards[index];

  const rate = async (rating: ReviewRating) => {
    if (!current) return;
    const outcome = reviewCard(current, rating, Date.now());
    await db.transaction("rw", db.reviewCards, db.reviewLogs, async () => {
      await db.reviewCards.update(current.id!, outcome.card);
      await db.reviewLogs.add({
        uid: newUid(),
        cardId: current.id!,
        rating: outcome.log.rating,
        reviewedAtMillis: outcome.log.reviewedAtMillis,
        previousDueAtMillis: outcome.log.previousDueAtMillis,
        nextDueAtMillis: outcome.log.nextDueAtMillis,
      });
    });
    setSaved((value) => value + 1);
    setRevealed(false);
    setIndex((value) => value + 1);
  };

  return (
    <main>
      <Link className="backlink" to="/review" onClick={() => navigate("/review")}>
        ← 返回复习总览
      </Link>
      <h1 className="page-title">{type === "all" ? "全部到期" : learningTypeLabel(type)}</h1>
      {!current ? (
        <div className="glass-card">
          <p className="card-desc" style={{ marginBottom: 0 }}>
            {saved > 0 ? `本轮已复习 ${saved} 张，全部完成！` : "当前分类没有到期卡片。"}
          </p>
          <div className="btn-row">
            <button className="btn" onClick={() => navigate("/review")}>返回</button>
          </div>
        </div>
      ) : (
        <>
          <div className="glass-card" style={{ textAlign: "center" }}>
            <div className="muted">
              第 {index + 1} / {dueCards.length} 张 · 已复习 {saved} 张
            </div>
            <div
              className="review-card"
              onClick={() => setRevealed((value) => !value)}
              role="button"
              tabIndex={0}
            >
              <div>{current.front}</div>
              {revealed ? (
                <div className="back" style={{ whiteSpace: "pre-wrap" }}>{current.back}</div>
              ) : (
                <div className="muted" style={{ marginTop: 14 }}>点击卡片翻面</div>
              )}
            </div>
            {revealed && (
              <div className="btn-row" style={{ justifyContent: "center" }}>
                {RATINGS.map((rating) => (
                  <button key={rating.value} className="btn" onClick={() => void rate(rating.value)}>
                    {rating.label}
                  </button>
                ))}
              </div>
            )}
            {!revealed && (
              <div className="btn-row" style={{ justifyContent: "center" }}>
                <button
                  className="btn"
                  onClick={() => {
                    // 听读支持：浏览器语音朗读正面。
                    try {
                      const utterance = new SpeechSynthesisUtterance(current.front);
                      utterance.lang = /[\u4e00-\u9fff]/.test(current.front) ? "zh-CN" : "en-US";
                      speechSynthesis.cancel();
                      speechSynthesis.speak(utterance);
                    } catch {
                      // 朗读不可用时静默忽略。
                    }
                  }}
                >
                  朗读
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
