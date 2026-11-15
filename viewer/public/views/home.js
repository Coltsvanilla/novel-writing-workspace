import { html } from '../lib/html.js';
import { href } from '../lib/route.js';
import { segments, fmt, emptyState, excerpt } from '../lib/ui.js';
import { liveBadge } from './rail.js';

const inbox = (list) => {
  const rows = list.flatMap((s) => [
    ...s.awaiting.map((a) => ({ s, text: a.label, to: href(s.name, a.docId), kind: 'review', kindLabel: '確認待ち' })),
    ...(s.changed ? [{ s, text: `未承認の変更 ${s.changed}件`, to: href(s.name), kind: 'changes', kindLabel: '変更あり' }] : []),
  ]);
  return html`
    <section class="inbox ${rows.length ? 'inbox--has' : ''}" aria-labelledby="inbox-h">
      <h2 class="inbox__title" id="inbox-h">確認待ち${rows.length ? html`<span class="inbox__count">${rows.length}</span>` : ''}</h2>
      ${rows.length
        ? html`<ul class="inbox__list">${rows.map((r) => html`
            <li><a class="inbox__row" href="${r.to}"><span class="inbox__kind inbox__kind--${r.kind}">${r.kindLabel}</span><span class="inbox__story">${r.s.name}</span><span class="inbox__text">${r.text}</span><span class="inbox__go" aria-hidden="true">→</span></a></li>`)}</ul>`
        : html`<p class="inbox__empty"><span aria-hidden="true">✓ </span>確認待ちはありません</p>`}
    </section>`;
};

const card = (s) => html`
  <li class="card">
    <h3 class="card__name"><a class="card__link" href="${href(s.name)}">${s.name}</a></h3>
    <p class="card__line"><b>最初</b>${excerpt(s.first, 60) || '未記入'}</p>
    <p class="card__line"><b>結末</b>${excerpt(s.last, 60) || '未記入'}</p>
    <div class="card__progress">
      ${segments(s)}
      <span><b>${s.approved}/${s.total}</b> 承認</span>
    </div>
    <p class="card__phase">${s.current ? html`現在：フェーズ${s.current.no} ${s.current.name}<span class="badge badge--${s.current.status.key}">${s.current.status.label}</span>` : html`<span class="badge badge--approved"><span aria-hidden="true" class="badge__glyph">✓</span>全フェーズ承認済み</span>`}</p>
    <ul class="card__meta">
      <li>${s.chapters}章</li>
      <li>${s.totalChars ? `${fmt(s.totalChars)}字` : '本文はこれから'}</li>
      <li>${s.lastCommit ? `最終コミット ${s.lastCommit.date}` : 'コミットなし'}</li>
    </ul>
    ${s.changed ? html`<span class="pill pill--modified">未承認の変更 ${s.changed}件</span>` : ''}
  </li>`;

export const home = (stories, live) => html`
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-head__title">物語ビューア</h1>
        <p class="muted">進み具合を確かめて、確認待ちの成果物を読むための画面です。</p>
      </div>
      ${liveBadge(live)}
    </header>
    ${inbox(stories)}
    <section aria-labelledby="stories-h">
      <h2 class="section-title" id="stories-h">物語</h2>
      ${stories.length
        ? html`<ul class="cards">${stories.map(card)}</ul>`
        : emptyState('まだ物語がありません', 'story-creator スキルで物語を作り始めると、ここに表示されます。stories/ フォルダにできた物語が自動で見つかります。')}
    </section>
  </div>`;
