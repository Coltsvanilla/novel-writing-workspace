import { html } from '../lib/html.js';
import { href } from '../lib/route.js';
import { col } from '/shared/md.js';
import { markdown } from '../lib/markdown.js';
import { splitLead, emptyState } from '../lib/ui.js';

const FILTERS = [
  ['all', 'すべて'],
  ['open', '未対応'],
  ['done', '反映済み'],
  ['skip', '見送り'],
];
const stateOf = (f) => (/^反映/.test(f.state) ? 'done' : /^見送/.test(f.state) ? 'skip' : 'open');
const SEV = { 高: 'high', 中: 'mid', 低: 'low' };

const checks = (r) =>
  r.checks.length
    ? html`
      <section class="block" aria-labelledby="chk">
        <h2 class="block__title" id="chk">観点別チェック</h2>
        <ul class="checks">
          ${r.checks.map((c) => {
            const ok = col(c, '結果').includes('良好');
            const { lead, rest } = splitLead(col(c, '観点'));
            return html`
              <li class="check check--${ok ? 'ok' : 'warn'}">
                <span class="badge ${ok ? 'badge--approved' : 'badge--wip'}"><span aria-hidden="true" class="badge__glyph">${ok ? '✓' : '!'}</span>${ok ? '良好' : '要改善'}</span>
                <div><p class="check__title">${lead || rest}</p>${lead ? html`<p class="check__sub">${rest}</p>` : ''}<p>${col(c, '所見')}</p></div>
              </li>`;
          })}
        </ul>
      </section>`
    : '';

const findings = (s, r, q) => {
  const f = FILTERS.some(([k]) => k === q.f) ? q.f : 'all';
  const count = (k) => (k === 'all' ? r.findings.length : r.findings.filter((x) => stateOf(x) === k).length);
  const shown = r.findings.filter((x) => f === 'all' || stateOf(x) === f);
  return html`
    <section class="block" aria-labelledby="fnd">
      <h2 class="block__title" id="fnd">指摘事項</h2>
      <nav class="tabs" aria-label="対応状況で絞り込み">
        ${FILTERS.map(([k, label]) => html`<a class="tabs__item" href="${href(s.name, 'review', k === 'all' ? {} : { f: k })}" ${f === k ? html`aria-current="true"` : ''}>${label}<span class="tabs__count">${count(k)}</span></a>`)}
      </nav>
      ${shown.length
        ? html`<ul class="findings">${shown.map((x) => html`
            <li class="finding">
              <header class="finding__head">
                <code>${x.id}</code>
                <span class="sev sev--${SEV[x.sev] ?? 'low'}">重大度 ${x.sev}</span>
                <span class="badge badge--state-${stateOf(x)}">${x.state || '未対応'}</span>
                <span class="finding__where">${x.where}</span>
              </header>
              <p>${x.what}</p>
              ${x.fix ? html`<p class="finding__fix"><b>修正案</b> ${x.fix}</p>` : ''}
            </li>`)}</ul>`
        : html`<p class="muted">この状態の指摘はありません。</p>`}
    </section>`;
};

const foreshadow = (r) =>
  r.foreshadow.length
    ? html`
      <section class="block" aria-labelledby="fs">
        <h2 class="block__title" id="fs">伏線の回収状況</h2>
        <ul class="flow">
          ${r.foreshadow.map((x) => {
            const st = col(x, '状態');
            const kind = st.includes('未回収') ? 'warn' : st.includes('残す') ? 'keep' : 'ok';
            return html`
              <li class="flow__item">
                <p class="flow__name">${col(x, '伏線')}</p>
                <dl class="flow__path">
                  <div><dt>張った</dt><dd>${col(x, '張った')}</dd></div>
                  <div><dt>回収</dt><dd>${col(x, '回収')}</dd></div>
                </dl>
                <span class="badge badge--flow-${kind}">${st}</span>
              </li>`;
          })}
        </ul>
      </section>`
    : '';

const good = (r) =>
  r.good.length
    ? html`
      <section class="block" aria-labelledby="good">
        <h2 class="block__title" id="good">良かった点</h2>
        <ul class="good">${r.good.map((g) => {
          const { lead, rest } = splitLead(g);
          return html`<li>${lead ? html`<b>${lead}</b>` : ''} ${rest}</li>`;
        })}</ul>
      </section>`
    : '';

export const review = {
  render({ story: s, q }) {
    const r = s.review;
    if (!r) return emptyState('全体レビューはまだ作られていません', 'フェーズ8で、全体レビューと完成稿が作られます。');
    return html`
      ${r.summary ? html`<section class="block"><h2 class="block__title">総評</h2><div class="prose prose--tight">${markdown(r.summary)}</div></section>` : ''}
      ${checks(r)}${findings(s, r, q)}${foreshadow(r)}${good(r)}
      ${r.applied ? html`<details class="block fold"><summary><h2 class="block__title">反映結果</h2></summary><div class="prose">${markdown(r.applied)}</div></details>` : ''}`;
  },
};
