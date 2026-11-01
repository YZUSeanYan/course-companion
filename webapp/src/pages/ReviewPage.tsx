// 复习页：分类总览（今日到期/卡片总数）+ 翻面评分。FSRS 参数与 Android 一致。
// 路由 /review 为总览，/review/:type 进入该分类的连续复习。
// 网页端形态：总览是统计主卡 + 分类网格；复习台支持键盘——空格翻面、1–4 评分。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newUid, type ReviewCardRecord } from "../lib/db/db";
import { summarizeReviewCategories, learningTypeLabel } from "../lib/pack";
import { reviewCard, type ReviewRating } from "../lib/fsrs/scheduler";

/** 评分四档与 Android 一致（不认识 / 模糊 / 认识 / 很简单），并给出键盘键位。 */
const RATINGS: { value: ReviewRating; label: string; key: string; hint: string }[] = [
  { value: 1, label: "不认识", key: "1", hint: "重来" },
  { value: 2, label: "模糊", key: "2", hint: "短间隔" },
  { value: 3, label: "认识", key: "3", hint: "正常" },
  { value: 4, label: "很简单", key: "4", hint: "长间隔" },
];

export default function ReviewPage() {
  const { type } = useParams();
  const navigate = useNavigate();
  const now = Date.now();
  const cards = useLiveQuery(() => db.reviewCards.toArray(), []);
  const summaries = useMemo(() => summarizeReviewCategories(cards ?? [], now), [cards, now]);

  if (!type) {
    const total = (cards ?? []).length;
    const due = (cards ?? []).filter((card) => card.dueAtMillis <= now).length;
    return (
      <>
        <div className="page-head">
          <div>
            <p className="eyebrow">Review</p>
            <h2>{due > 0 ? `今天还有 ${due} 张要复习` : "今天没有到期卡片"}</h2>
            <p>间隔重复按 FSRS 调度：到期卡片可跨分类连续复习，也可只练某一类。</p>
          </div>
        </div>

        <div className="glass-card glass-card--hero">
          <div className="stat-hero">
            <div className="stat-hero__num">
              {due}
              <span>张</span>
            </div>
            <div>
              <div className="card-title" style={{ marginBottom: 6 }}>
                今日到期
                <span className="pill">{total} 张卡片在库</span>
              </div>
              <p className="card-desc" style={{ marginBottom: 0 }}>
                {due > 0
                  ? "到期卡片按到期时间先后出现，先还旧账再学新内容。"
                  : "今天没有到期卡片。继续听课或导入讲义，新内容会自动生成复习卡。"}
              </p>
              {due > 0 && (
                <div className="btn-row">
                  <button className="btn btn-primary" onClick={() => navigate("/review/all")}>
                    全部到期（{due}）
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {summaries.length > 0 && (
          <div className="category-grid">
            {summaries.map((summary) => (
              <div className="glass-card" key={summary.type}>
                <div className="card-title">
                  {summary.label}
                  <span className={`pill ${summary.due > 0 ? "pill-brand" : ""}`}>
                    {summary.due > 0 ? `到期 ${summary.due}` : "无到期"}
                  </span>
                </div>
                <p className="card-desc">{summary.description}</p>
                <div className="muted">
                  共 {summary.total} 张
                  {summary.nextDueAtMillis ? ` · 下次 ${new Date(summary.nextDueAtMillis).toLocaleString("zh-CN")}` : ""}
                </div>
                <div className="btn-row">
                  <button className="btn btn-sm" onClick={() => navigate(`/review/${summary.type}`)}>
                    开始复习
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {summaries.length === 0 && (
          <div className="glass-card">
            <p className="card-desc" style={{ marginBottom: 0 }}>
              还没有复习卡片。词汇、短语、自测问答与练习会在生成学习包时自动进入复习。
            </p>
          </div>
        )}
      </>
    );
  }

  // key={type}：/review/all 与 /review/VOCABULARY 之间切换时组件实例不变，
  // 不加 key 会沿用上一轮的队列快照（换了分类却还在复习旧分类的卡）。
  return <ReviewSession key={type} type={type} />;
}

function ReviewSession({ type }: { type: string }) {
  const navigate = useNavigate();
  const now = Date.now();
  const cards = useLiveQuery(() => db.reviewCards.toArray(), []);
  const dueCards = useMemo(() => {
    const pool = (cards ?? []).filter((card) => card.dueAtMillis <= now);
    const selected = type === "all" ? pool : pool.filter((card) => card.itemType === type);
    return selected.sort((a, b) => a.dueAtMillis - b.dueAtMillis);
  }, [cards, type]);

  // 本轮队列在进入时快照一次：评分会把这张卡的 dueAt 推到未来，实时过滤的列表会立刻
  // 少一张，而 index 同时 +1——两下一叠加就会跳过下一张（表现为「第 2/3 张」瞬间变
  // 「第 2/2 张」，中间那张永远没出现）。快照后本轮按固定顺序走完。
  const dueKey = dueCards.map((card) => card.id).join(",");
  const [queue, setQueue] = useState<ReviewCardRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saved, setSaved] = useState(0);
  const snapshotRef = useRef<string | null>(null);
  // 评分事务进行中：挡住键盘长按重复触发与连点评分，否则同一张卡会被评多次、
  // 后一次覆盖前一次的结果，还会写入重复日志。
  const ratingRef = useRef(false);

  // 首次拿到数据、或切换分类时重建队列；评分本身引起的列表变化不重建。
  useEffect(() => {
    if (snapshotRef.current === null && dueKey.length > 0) {
      snapshotRef.current = dueKey;
      setQueue(dueCards);
      setIndex(0);
      setRevealed(false);
    }
  }, [dueKey, dueCards]);

  const active = queue.length > 0 ? queue : dueCards;
  const current: ReviewCardRecord | undefined = active[index];
  const total = active.length;
  const progress = total === 0 ? 100 : Math.round((Math.min(index, total) / total) * 100);

  const rate = useCallback(
    async (rating: ReviewRating) => {
      if (!current || ratingRef.current) return;
      ratingRef.current = true;
      try {
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
      } finally {
        ratingRef.current = false;
      }
    },
    [current],
  );

  const stageRef = useRef<HTMLDivElement | null>(null);
  const reveal = useCallback(() => {
    setRevealed(true);
    // 翻面后按钮会重排，把焦点收回舞台，键盘操作才继续有效。
    stageRef.current?.focus({ preventScroll: true });
  }, []);

  // 监听挂在 window 上：按钮点完就卸载，焦点会掉回 body，绑在容器上的 keydown 随之失效。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      // 输入控件和按钮保留原生行为（Enter/空格激活），不抢。
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
      if (event.repeat) return;
      if (event.key === " " || event.key === "Enter") {
        if (!revealed) {
          event.preventDefault();
          reveal();
        }
        return;
      }
      if (revealed) {
        const hit = RATINGS.find((rating) => rating.key === event.key);
        if (hit) {
          event.preventDefault();
          void rate(hit.value);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, reveal, rate]);

  const speak = () => {
    if (!current) return;
    try {
      const utterance = new SpeechSynthesisUtterance(current.front);
      utterance.lang = /[\u4e00-\u9fff]/.test(current.front) ? "zh-CN" : "en-US";
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    } catch {
      // 朗读不可用时静默忽略。
    }
  };

  return (
    <div className="review-stage" ref={stageRef} tabIndex={-1}>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <p className="eyebrow">{type === "all" ? "All due" : learningTypeLabel(type)}</p>
          <h2>{type === "all" ? "全部到期" : learningTypeLabel(type)}</h2>
        </div>
        <div className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
          第 {Math.min(index + 1, total || 1)} / {total || 0} 张 · 已复习 {saved} 张
        </div>
      </div>

      {!current ? (
        <div className="glass-card glass-card--hero" style={{ textAlign: "center", padding: "40px 22px" }}>
          <p className="eyebrow" style={{ justifyContent: "center" }}>
            Session done
          </p>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>
            {saved > 0 ? `本轮已复习 ${saved} 张，全部完成` : "当前分类没有到期卡片"}
          </h2>
          <p className="card-desc">{saved > 0 ? "间隔已按评分重排，到期时再来。" : "换一个分类，或等新卡片到期。"}</p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => navigate("/review")}>
              返回复习总览
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="glass-card">
            <div
              className="review-card"
              onClick={() => setRevealed((value) => !value)}
              role="button"
              tabIndex={0}
              aria-label={revealed ? "收起答案" : "翻面查看答案"}
            >
              <div className="review-card__front">{current.front}</div>
              {revealed ? (
                <div className="back" style={{ whiteSpace: "pre-wrap" }}>
                  {current.back}
                </div>
              ) : (
                <div className="review-hint">
                  点击卡片或按 <kbd className="kbd">空格</kbd> 翻面
                </div>
              )}
            </div>

            <div className="review-progress" aria-hidden>
              <i style={{ width: `${progress}%` }} />
            </div>

            {/* 本卡统计：与 Android 复习会话一致（复习次数 / 错题次数 / 上次复习） */}
            <p className="review-hint" style={{ textAlign: "center" }}>
              本卡复习 {current.reps} 次
              {current.lapses > 0 ? ` · 错题 ${current.lapses} 次` : ""}
              {current.lastReviewedAtMillis ? ` · 上次 ${new Date(current.lastReviewedAtMillis).toLocaleDateString("zh-CN")}` : " · 首次复习"}
            </p>

            {revealed ? (
              <div className="rating-row">
                {RATINGS.map((rating) => (
                  <button key={rating.value} className="btn" onClick={() => void rate(rating.value)}>
                    <span>{rating.label}</span>
                    <small>
                      <kbd className="kbd">{rating.key}</kbd> {rating.hint}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="btn-row" style={{ justifyContent: "center" }}>
                <button className="btn" onClick={speak}>
                  朗读
                </button>
                <button className="btn btn-primary" onClick={reveal}>
                  翻面
                </button>
              </div>
            )}
          </div>
          <p className="review-hint review-hint--keys" style={{ textAlign: "center" }}>
            键盘：<kbd className="kbd">空格</kbd> 翻面 · <kbd className="kbd">1</kbd>
            <kbd className="kbd">2</kbd>
            <kbd className="kbd">3</kbd>
            <kbd className="kbd">4</kbd> 评分
          </p>
        </>
      )}
    </div>
  );
}
