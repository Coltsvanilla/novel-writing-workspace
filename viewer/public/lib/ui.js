import { html } from './html.js';
import { href } from './route.js';

const GLYPH = { approved: '✓', review: '!', wip: '…', todo: '' };

export const fmt = (n) => Number(n ?? 0).toLocaleString('ja-JP');
export const chapterCount = (s) => Math.max(0, ...s.chapters.map((c) => c.no));

/** 色だけに頼らないよう、記号とラベル文字を併用する */
export const statusDot = (status) => {
  const s = status ?? { key: 'todo', label: '未着手' };
  return html`<span class="dot dot--${s.key}" title="${s.label}"><span aria-hidden="true">${GLYPH[s.key]}</span><span class="sr">${s.label}</span></span>`;
};

export const statusBadge = (status) => {
  if (!status) return '';
  return html`<span class="badge badge--${status.key}"><span aria-hidden="true" class="badge__glyph">${GLYPH[status.key]}</span>${status.label}</span>`;
};

const CHANGE = { modified: '変更あり', new: '新規', deleted: '削除' };
export const changePill = (changes) => (changes ? html`<span class="pill pill--${changes}">${CHANGE[changes]}</span>` : '');

/** 8分割の進捗。phases があれば実際の状態を、なければ承認数と現在フェーズから組み立てる */
export function segments({ phases, approved, total, current }) {
  const list = phases ?? Array.from({ length: total }, (_, i) => ({ status: { key: i < approved ? 'approved' : i === approved && current ? current.status.key : 'todo' } }));
  return html`<span class="segments" aria-hidden="true">${list.map((p) => html`<span class="segments__cell segments__cell--${p.status.key}"></span>`)}</span>`;
}

export const emptyState = (title, body, action) => html`
  <div class="empty">
    <p class="empty__title">${title}</p>
    ${body ? html`<p class="empty__body">${body}</p>` : ''}
    ${action ?? ''}
  </div>`;

export const docLink = (story, docId, label, cls = '') => html`<a class="${cls}" href="${href(story, docId)}">${label}</a>`;

/** 「キー：値」の箇条書きを分ける */
export function splitLead(s, sep = /[：:]/) {
  const m = s.match(sep);
  if (!m || m.index > 24) return { lead: '', rest: s };
  return { lead: s.slice(0, m.index).trim(), rest: s.slice(m.index + 1).trim() };
}

export const excerpt = (s, n = 70) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const end = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('、'));
  return `${end > n * 0.5 ? cut.slice(0, end + 1) : cut}…`;
};
