// 定稿补翻队列的进程内单例。
//
// 课堂停止可能从主页面或小窗触发；两边必须共用同一个队列，否则会同时为同一批
// 未翻译行排队、重复扣翻译额度。课中实时译文由服务端推送，这里只兜底补缺。

import { TranslationQueue } from "./translate-queue";

let current: TranslationQueue | null = null;

/** 目标语言跟着讲师语言走：英文课翻成中文，中文课翻成英文。 */
export function translationQueueFor(sourceLanguage: string): TranslationQueue {
  const target: "zh-CN" | "en-US" = sourceLanguage === "en" ? "zh-CN" : "en-US";
  if (!current || current.targetLang !== target) {
    current = new TranslationQueue(target);
  }
  return current;
}

/** 为尚未翻译的定稿行排队补翻（不阻塞调用方）。 */
export function enqueueSessionTranslation(sessionId: number, sourceLanguage: string): void {
  void translationQueueFor(sourceLanguage).enqueueSession(sessionId);
}
