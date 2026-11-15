import { html } from '../lib/html.js';
import { href, HOME } from '../lib/route.js';
import { statusDot, changePill, segments } from '../lib/ui.js';

export const LIVE_TEXT = { ok: 'ライブ更新中', lost: '再接続しています…' };

export const liveBadge = (live) => html`<span class="live live--${live}" role="status">${LIVE_TEXT[live]}</span>`;

function groups(s) {
  const out = [];
  for (const d of s.docs) {
    const last = out.at(-1);
    if (last && last.name === d.group) last.docs.push(d);
    else out.push({ name: d.group, docs: [d] });
  }
  return out;
}

const heading = (s, group) => {
  const no = Number(group.match(/\d+/)?.[0]);
  const phase = s.phases.find((p) => p.no === no);
  return html`<h2 class="nav__group">${group}${phase ? html`<span> ${phase.name}</span>` : ''}</h2>`;
};

const row = (s, d, current) => html`
  <li>
    <a class="nav__row ${d.path ? '' : 'is-missing'}" href="${href(s.name, d.id)}" ${d.id === current ? html`aria-current="page"` : ''}>
      ${d.status ? statusDot(d.status) : html`<span class="dot dot--none" aria-hidden="true"></span>`}
      <span class="nav__label">${d.label}</span>
      ${d.path ? changePill(d.changes) : html`<span class="nav__tag">未作成</span>`}
    </a>
  </li>`;

export const rail = (s, current, ui, live) => html`
  <aside class="rail ${ui.menuOpen ? 'is-open' : ''}" data-keep-scroll="rail">
    <div class="rail__top">
      <a class="rail__back" href="${HOME}">← ホームへ戻る</a>
      <button type="button" class="btn rail__toggle" data-act="menu" aria-expanded="${ui.menuOpen}" aria-controls="rail-nav">成果物の一覧</button>
    </div>
    <div class="rail__story">
      <h1 class="rail__name"><a href="${href(s.name)}">${s.name}</a></h1>
      ${segments({ phases: s.phases })}
      <p class="rail__progress"><b>${s.progress.approved}/${s.progress.total}</b> 承認<br><span class="muted">${s.progress.current ? `現在：フェーズ${s.progress.current.no} ${s.progress.current.name}（${s.progress.current.status.label}）` : 'すべて承認済み'}</span></p>
    </div>
    <nav class="nav" id="rail-nav" aria-label="成果物">
      ${groups(s).map((g) => html`
        <section>
          ${g.name ? heading(s, g.name) : ''}
          <ul class="nav__list">${g.docs.map((d) => row(s, d, current))}</ul>
        </section>`)}
    </nav>
    <div class="rail__foot">${liveBadge(live)}</div>
  </aside>`;
