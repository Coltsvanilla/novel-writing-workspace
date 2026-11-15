import { html } from './html.js';

/** unified diff → { hunks, add, del }。ファイルヘッダ（diff --git / index / --- / +++）は捨てる */
export function parseDiff(text) {
  const hunks = [];
  let add = 0, del = 0, o = 0, n = 0, cur = null;
  for (const line of (text ?? '').split(/\r?\n/)) {
    const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@\s?(.*)/);
    if (h) {
      o = Number(h[1]);
      n = Number(h[2]);
      cur = { start: n, hint: h[3], lines: [] };
      hunks.push(cur);
    } else if (cur && line.startsWith('+')) {
      cur.lines.push({ t: 'add', text: line.slice(1), n: n++ });
      add++;
    } else if (cur && line.startsWith('-')) {
      cur.lines.push({ t: 'del', text: line.slice(1), o: o++ });
      del++;
    } else if (cur && line.startsWith(' ')) {
      cur.lines.push({ t: 'ctx', text: line.slice(1), o: o++, n: n++ });
    }
  }
  return { hunks, add, del };
}

/** 行頭・行末の共通部分を除いた「実際に変わった箇所」を求める */
function span(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return { p, s };
}

const mark = (text, p, s) => (p + s >= text.length ? html`${text}` : html`${text.slice(0, p)}<mark>${text.slice(p, text.length - s)}</mark>${text.slice(text.length - s)}`);

/** 連続する削除行と追加行を順に組にして、行内の変更箇所を強調する */
function pairUp(lines) {
  const out = lines.map((l) => ({ ...l, body: html`${l.text}` }));
  for (let i = 0; i < out.length; ) {
    if (out[i].t !== 'del') { i++; continue; }
    let d = i;
    while (d < out.length && out[d].t === 'del') d++;
    let a = d;
    while (a < out.length && out[a].t === 'add') a++;
    const count = Math.min(d - i, a - d);
    for (let k = 0; k < count; k++) {
      const x = out[i + k], y = out[d + k];
      const { p, s } = span(x.text, y.text);
      if (p + s < Math.min(x.text.length, y.text.length) * 0.4) continue;
      x.body = mark(x.text, p, s);
      y.body = mark(y.text, p, s);
    }
    i = a;
  }
  return out;
}

const SIGN = { add: '+', del: '−', ctx: '' };

export function renderDiff(text) {
  const { hunks, add, del } = parseDiff(text);
  if (!hunks.length) return html`<p class="muted">表示できる差分がありません。</p>`;
  return html`
    <div class="diff">
      <p class="diff__sum"><span class="diff__add">+${add}</span> <span class="diff__del">−${del}</span> 行<span class="muted">（最後の承認から未コミットの変更）</span></p>
      ${hunks.map((h) => html`
        <section class="diff__hunk" aria-label="${h.start}行目付近の変更">
          <h3 class="diff__head">${h.start}行目付近${h.hint ? html`<span class="muted"> ${h.hint}</span>` : ''}</h3>
          <div class="diff__rows">
            ${pairUp(h.lines).map((l) => html`
              <div class="diff__row diff__row--${l.t}">
                <span class="diff__no" aria-hidden="true">${l.o ?? ''}</span>
                <span class="diff__no" aria-hidden="true">${l.n ?? ''}</span>
                <span class="diff__sign" aria-label="${l.t === 'add' ? '追加' : l.t === 'del' ? '削除' : '変更なし'}">${SIGN[l.t]}</span>
                <span class="diff__text">${l.body}</span>
              </div>`)}
          </div>
        </section>`)}
    </div>`;
}
