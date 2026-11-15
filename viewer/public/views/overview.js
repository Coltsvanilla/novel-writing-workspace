import { html } from '../lib/html.js';
import { href } from '../lib/route.js';
import { col } from '/shared/md.js';
import { statusBadge, changePill, fmt, splitLead, excerpt } from '../lib/ui.js';

const phaseDoc = (s, no) => s.docs.find((d) => d.group === `フェーズ${no}` && d.path);
const docByPath = (s, path) => s.docs.find((d) => d.path === path);

const awaitingBand = (s) =>
  s.awaiting.length
    ? html`
      <section class="band band--review" aria-labelledby="aw">
        <h2 id="aw" class="band__title">確認待ち ${s.awaiting.length}件</h2>
        <ul class="band__list">
          ${s.awaiting.map((a) => html`<li><a href="${href(s.name, a.docId)}">${a.label}<span aria-hidden="true"> →</span></a></li>`)}
        </ul>
      </section>`
    : '';

const dirtyBand = (s) =>
  s.git.dirty.length
    ? html`
      <section class="band band--changes" aria-labelledby="dirty">
        <h2 id="dirty" class="band__title">承認前の変更 ${s.git.dirty.length}件</h2>
        <ul class="band__list">
          ${s.git.dirty.map((d) => {
            const doc = docByPath(s, d.path);
            return html`<li>${doc ? html`<a href="${href(s.name, doc.id, d.state === 'modified' ? { view: 'diff' } : {})}">${doc.label}</a>` : d.path} ${changePill(d.state)}</li>`;
          })}
        </ul>
      </section>`
    : '';

const hero = (s) => html`
  <section class="hero" aria-label="物語の最初と結末">
    <figure class="hero__card">
      <figcaption>最初</figcaption>
      <blockquote>${s.input.first || '未記入'}</blockquote>
    </figure>
    <span class="hero__arrow" aria-hidden="true">→</span>
    <figure class="hero__card hero__card--end">
      <figcaption>結末</figcaption>
      <blockquote>${s.input.last || '未記入'}</blockquote>
    </figure>
  </section>`;

const chips = (s) => {
  const chip = (t) => {
    const { lead, rest } = splitLead(t);
    return html`<li class="chip">${lead ? html`<b>${lead}</b>` : ''}<span>${rest}</span></li>`;
  };
  return html`
    ${s.extras.length ? html`<section class="block"><h2 class="block__title">補足</h2><ul class="chips">${s.extras.map(chip)}</ul></section>` : ''}
    ${s.policy.length ? html`<section class="block"><h2 class="block__title">執筆方針</h2><ul class="chips">${s.policy.map(chip)}</ul></section>` : ''}`;
};

const steps = (s) => html`
  <section class="block" aria-labelledby="steps">
    <h2 class="block__title" id="steps">フェーズの進み具合</h2>
    <ol class="steps">
      ${s.phases.map((p) => {
        const d = phaseDoc(s, p.no);
        const inner = html`<span class="steps__no">フェーズ${p.no}</span><span class="steps__name">${p.name}</span>${statusBadge(p.status)}<span class="steps__date">${p.date || ''}</span>`;
        return html`<li class="steps__item steps__item--${p.status.key}">${d ? html`<a href="${href(s.name, d.id)}">${inner}</a>` : html`<div>${inner}</div>`}</li>`;
      })}
    </ol>
  </section>`;

const chapterStrip = (s) =>
  s.chapters.length
    ? html`
      <section class="block" aria-labelledby="chs">
        <h2 class="block__title" id="chs">章ごとの状況</h2>
        <ol class="strip">
          ${s.chapters.map((c) => {
            const target = c.hasDraft ? `draft-${c.no}` : c.hasPlot ? `plot-${c.no}` : null;
            const inner = html`
              <span class="strip__no">第${c.no}章 ${c.role ? html`<span class="strip__role">${c.role}</span>` : ''}</span>
              <span class="strip__title">${c.title}</span>
              ${c.summary ? html`<span class="strip__sum">${excerpt(c.summary, 48)}</span>` : ''}
              <span class="strip__foot">${statusBadge(c.status)}<span class="strip__chars">${c.hasDraft ? `${fmt(c.chars)}字` : '本文は未作成'}</span></span>`;
            return html`<li class="strip__item">${target ? html`<a href="${href(s.name, target)}">${inner}</a>` : html`<div>${inner}</div>`}</li>`;
          })}
        </ol>
      </section>`
    : '';

const changeLog = (s) =>
  s.log.length
    ? html`
      <details class="block fold">
        <summary><h2 class="block__title">変更履歴（承認後に直した内容）<span class="muted"> ${s.log.length}件</span></h2></summary>
        <ol class="timeline">
          ${s.log.map((r) => html`
            <li class="timeline__item">
              <time>${r['日付']}</time>
              <div>
                <p class="timeline__main">${col(r, '内容')}</p>
                <p class="timeline__sub"><code>${col(r, '修正したファイル')}</code> ${col(r, 'きっかけ')}</p>
              </div>
            </li>`)}
        </ol>
      </details>`
    : '';

const HISTORY_SHOWN = 8;
const commit = (c) => html`<li class="timeline__item"><time>${c.date}</time><div><p class="timeline__main">${c.subject}</p><p class="timeline__sub"><code>${c.hash}</code></p></div></li>`;

const approvals = (s) => {
  const h = s.git.history;
  return html`
    <section class="block" aria-labelledby="hist">
      <h2 class="block__title" id="hist">承認履歴</h2>
      ${!s.git.available
        ? html`<p class="muted">Gitの履歴を取得できません。</p>`
        : !h.length
          ? html`<p class="muted">まだコミットがありません。</p>`
          : html`
            <ol class="timeline">${h.slice(0, HISTORY_SHOWN).map(commit)}</ol>
            ${h.length > HISTORY_SHOWN ? html`<details class="more"><summary>残り${h.length - HISTORY_SHOWN}件を表示</summary><ol class="timeline">${h.slice(HISTORY_SHOWN).map(commit)}</ol></details>` : ''}`}
    </section>`;
};

export const overview = {
  render: ({ story: s }) => html`${awaitingBand(s)}${dirtyBand(s)}${hero(s)}${chips(s)}${steps(s)}${chapterStrip(s)}${changeLog(s)}${approvals(s)}`,
};
