/**
 * 章の参照を、物語全体の通し番号（ord）に直す部品。サーバー（テスト）と画面が同じ実装を使う。
 *
 * 短編モード：章は「第N章」だけ。通し番号 = 章番号。
 * 長編モード：章は「第P部 第N章」（章番号は部の中で1から数える）。画面の並び・相関図のスライダーなどは、
 *             部→章の順に1から振った通し番号で扱い、表示だけ「第P部 第N章」にする。
 *
 * 長編モードの参照表記（表の「章」列や、人物の登場章など）：
 *   「第2部 第3章」／範囲「第2部 第1〜4章」／列挙「第2部 第1・3章」／部全体「第2部」／複数部「第1部〜第3部」
 */
import { nums } from './md.js';

/** @typedef {{ no: number, part: number, chNo: number, label: string }} ChapterRef */

/**
 * @param {ChapterRef[]} chapters
 * @param {boolean} long
 */
export function buildIndex(chapters, long) {
  const byKey = new Map();
  const byPart = new Map();
  for (const c of chapters) {
    byKey.set(`${c.part}-${c.chNo}`, c.no);
    if (!byPart.has(c.part)) byPart.set(c.part, []);
    byPart.get(c.part).push(c.no);
  }
  return { long, byKey, byPart };
}

/** 「1〜4・6」→ [1,2,3,4,6] */
export function expandNumbers(s) {
  const set = new Set();
  const rest = String(s).replace(/(\d+)\s*[〜~～]\s*(\d+)/g, (_, a, b) => {
    for (let i = +a; i <= +b; i++) set.add(i);
    return ' ';
  });
  nums(rest).forEach((n) => set.add(n));
  return [...set].sort((a, b) => a - b);
}

const PART_CHAPTERS = /第?\s*(\d+)\s*部\s*[の、,]?\s*第?\s*([\d〜~～・,、\s]+?)\s*章/g;
const PART_ONLY = /第?\s*(\d+)\s*部(?:\s*[〜~～]\s*第?\s*(\d+)\s*部)?/g;

/**
 * 文中の章の参照を、すべて通し番号にして昇順で返す。
 * 長編モードでなければ、文中の数字をそのまま章番号として返す。
 */
export function refOrds(text, index) {
  const s = String(text ?? '');
  if (!index?.long) return expandNumbers(s);
  const out = new Set();
  const rest = s.replace(PART_CHAPTERS, (_, p, list) => {
    for (const n of expandNumbers(list)) {
      const ord = index.byKey.get(`${+p}-${n}`);
      if (ord) out.add(ord);
    }
    return ' ';
  });
  rest.replace(PART_ONLY, (_, a, b) => {
    for (let p = +a; p <= +(b ?? a); p++) (index.byPart.get(p) ?? []).forEach((o) => out.add(o));
    return ' ';
  });
  return [...out].sort((a, b) => a - b);
}

/** 先頭の1つだけ（章ごとの変化表の「章」列など、単独の参照用） */
export const refOrd = (text, index) => refOrds(text, index)[0];

/** 通し番号 → 表示名（「第2部 第3章」）。見つからなければ「第N章」 */
export const labelOf = (chapters, ord) => chapters.find((c) => c.no === ord)?.label ?? `第${ord}章`;
