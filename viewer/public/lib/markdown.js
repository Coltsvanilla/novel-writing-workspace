import { raw } from './html.js';

const MERMAID = /^```mermaid[\s\S]*?^```[ \t]*$/gm;

/** 相関図はグラフで見せるので、Mermaid のコードブロックは描画前に落とす */
export const stripMermaid = (text) => text.replace(MERMAID, '');

/**
 * ローカルの自作ファイル由来なので marked の出力は信頼して通す。
 * 表は横にあふれても読めるようスクロール枠で包む。
 */
export function markdown(text, { dropTitle = false } = {}) {
  let src = stripMermaid(text ?? '');
  if (dropTitle) src = src.replace(/^\s*# .*\n?/, '');
  const out = marked.parse(src, { gfm: true });
  return raw(out.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>'));
}
