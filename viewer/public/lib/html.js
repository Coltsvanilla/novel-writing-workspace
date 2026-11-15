/**
 * 画面に出す文字列のエスケープはここだけで行う。
 * html`...` は補間した値を既定でエスケープし、html`` の結果（Raw）と配列だけをそのまま通す。
 * marked の出力のように信頼済みの HTML は raw() で明示的に通す。
 */
class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

const part = (v) => {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
};

export const html = (strings, ...vals) => new Raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? part(vals[i]) : ''), ''));
export const raw = (s) => new Raw(s);
export const unwrap = (r) => part(r);
