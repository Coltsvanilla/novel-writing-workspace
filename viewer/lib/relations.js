/**
 * 相関図の「第N章の時点」を決める純粋関数。サーバー（テスト）と画面が同じ実装を使う。
 * chapter = 0 は物語開始時点。
 */
import { short } from './md.js';

/**
 * @param {{ since: number, base: {rel:string}|null, timeline: {ch:number, after:string}[] }} edge
 * @param {number} chapter
 */
export function edgeAt(edge, chapter) {
  const done = edge.timeline.filter((t) => t.ch <= chapter);
  const last = done.at(-1);
  return {
    visible: edge.since <= chapter,
    label: last ? short(last.after, 18) : edge.base ? short(edge.base.rel, 18) : '',
    changedNow: edge.timeline.some((t) => t.ch === chapter),
    history: done,
  };
}

/**
 * 開始時点の関係表に載る人物は、未登場でも図に出す（淡く表示する）。表にない人物は初登場の章から出す。
 * @param {{ initial: boolean, first: number }} node
 */
export function nodeAt(node, chapter) {
  return {
    visible: node.initial || node.first <= chapter,
    dim: chapter > 0 && node.initial && node.first > chapter,
  };
}
