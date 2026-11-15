import { html } from '../lib/html.js';
import { href, HOME } from '../lib/route.js';
import { renderDiff } from '../lib/diff.js';
import { statusBadge, emptyState } from '../lib/ui.js';
import { viewFor } from './registry.js';
import { rail } from './rail.js';

const MODES = [
  ['', '整形'],
  ['raw', '原文'],
  ['diff', '差分'],
];

const tabs = (s, doc, mode) => html`
  <nav class="tabs" aria-label="表示の切り替え">
    ${MODES.filter(([k]) => k !== 'diff' || doc.changes === 'modified').map(([k, label]) => html`<a class="tabs__item" href="${href(s.name, doc.id, k ? { view: k } : {})}" ${mode === k ? html`aria-current="true"` : ''}>${label}</a>`)}
  </nav>`;

const notices = (s, doc, mode) => html`
  ${s.awaiting.some((a) => a.docId === doc.id)
    ? html`<div class="band band--review" role="note"><b>確認待ちです。</b>内容を読んで、承認するか、直したい点をチャットで伝えてください。</div>`
    : ''}
  ${doc.changes === 'new' ? html`<div class="band band--new" role="note">新規ファイル（まだ承認されていません）</div>` : ''}
  ${doc.changes === 'modified' && mode !== 'diff' ? html`<div class="band band--changes" role="note">最後の承認から変更されています（未承認）。<a href="${href(s.name, doc.id, { view: 'diff' })}">差分を見る</a></div>` : ''}`;

function body(ctx, mode) {
  const { doc, file } = ctx;
  if (!doc.path) return { html: emptyState('まだ作られていません', `「${doc.label}」は、物語づくりがこのフェーズに進むと作られます。`) };
  if (!file || file.path !== doc.path) return { html: html`<p class="muted loading">読み込み中…</p>` };
  if (mode === 'diff') return { html: file.diff ? renderDiff(file.diff) : html`<p class="muted">差分を取得できませんでした。</p>` };
  if (mode === 'raw') return { html: html`<pre class="raw" tabindex="0">${file.text}</pre>` };
  const view = viewFor(doc.id);
  if (!view) return { html: html`<p class="muted">この成果物の表示は未対応です。原文で確認してください。</p>` };
  return { html: view.render(ctx), view };
}

/** 成果物1つ分の画面。描画後に view.mount を呼べるよう、使った view も返す */
export function storyPage({ story: s, route, file, ui, replaceQuery }) {
  const doc = s.docs.find((d) => d.id === route.docId);
  if (!doc) {
    return { html: html`<div class="shell">${rail(s, '', ui, ui.live)}<main class="main">${emptyState('その成果物は見つかりません', '', html`<a class="btn" href="${href(s.name)}">概要へ戻る</a>`)}</main></div>` };
  }
  const requested = route.q.view;
  const mode = requested === 'diff' && doc.changes !== 'modified' ? '' : MODES.some(([k]) => k === requested) ? requested : '';
  const ctx = { story: s, doc, file, q: route.q, ui, replaceQuery };
  const inner = body(ctx, mode);
  const isOverview = doc.id === 'overview';
  return {
    html: html`
      <div class="shell">
        ${rail(s, doc.id, ui, ui.live)}
        <main class="main" id="main">
          <header class="doc-head">
            <p class="doc-head__eyebrow">${isOverview ? '概要・進捗' : doc.group}</p>
            <div class="doc-head__row">
              <h1 class="doc-head__title">${isOverview ? s.name : doc.label}</h1>
              ${statusBadge(doc.status)}
            </div>
            ${doc.path ? tabs(s, doc, mode) : ''}
          </header>
          ${notices(s, doc, mode)}
          <div class="doc-body" data-view-root>${inner.html}</div>
        </main>
      </div>`,
    mount: (root) => inner.view?.mount?.(root.querySelector('[data-view-root]'), ctx),
    unmount: () => inner.view?.unmount?.(),
  };
}

export const missingStory = (name) => html`
  <div class="page">${emptyState('その物語は見つかりません', `「${name}」という物語はありません。`, html`<a class="btn" href="${HOME}">ホームへ戻る</a>`)}</div>`;
