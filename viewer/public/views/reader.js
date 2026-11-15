import { html, raw, unwrap } from '../lib/html.js';
import { href } from '../lib/route.js';
import { markdown } from '../lib/markdown.js';
import { splitSections } from '/shared/md.js';

export const SIZES = [14, 16, 18, 20, 22, 26];

/** 会話文と地の文でインデントを分ける（日本語の小説の組み方） */
const novel = (text) => raw(unwrap(markdown(text)).replace(/<p>(?=[「『（])/g, '<p class="dlg">'));

const toolbar = ({ size, vertical }) => html`
  <div class="readbar" role="group" aria-label="読みやすさの設定">
    <span class="readbar__label">文字の大きさ</span>
    <button type="button" class="btn" data-act="font" data-v="-1" ${size <= SIZES[0] ? 'disabled' : ''} aria-label="文字を小さく">A−</button>
    <button type="button" class="btn" data-act="font" data-v="1" ${size >= SIZES.at(-1) ? 'disabled' : ''} aria-label="文字を大きく">A＋</button>
    <button type="button" class="btn ${vertical ? 'is-on' : ''}" data-act="vertical" aria-pressed="${vertical}">縦書き</button>
  </div>`;

const page = (reading, inner) => html`
  ${toolbar(reading)}
  <article class="reader ${reading.vertical ? 'reader--v' : ''}" style="--reader-size:${reading.size}px" lang="ja" tabindex="0" aria-label="本文">
    <div class="reader__body">${inner}</div>
  </article>`;

const draft = ({ story: s, doc, file, ui }) => {
  const secs = splitSections(file.text, 2);
  const main = secs.find((x) => x.title === '本文');
  const body = (main ? main.body : file.text).replace(/\n-{3,}\s*$/, '');
  const notes = main ? secs.filter((x) => x.title && x !== main) : [];
  const drafts = s.docs.filter((d) => d.id.startsWith('draft-') && d.path);
  const i = drafts.findIndex((d) => d.id === doc.id);
  const [prev, next] = [drafts[i - 1], drafts[i + 1]];
  return html`
    ${page(ui.reading, novel(body))}
    <nav class="pager" aria-label="前後の章">
      ${prev ? html`<a class="pager__prev" href="${href(s.name, prev.id)}"><span>← 前の章</span>${prev.label}</a>` : html`<span></span>`}
      ${next ? html`<a class="pager__next" href="${href(s.name, next.id)}"><span>次の章 →</span>${next.label}</a>` : html`<span></span>`}
    </nav>
    ${notes.map((n) => html`<details class="block fold"><summary><h2 class="block__title">${n.title}</h2></summary><div class="prose">${markdown(n.body)}</div></details>`)}`;
};

const manuscript = ({ file, ui }) => {
  const chapters = splitSections(file.text, 2).filter((x) => x.title);
  const toc = html`
    <nav class="toc" aria-label="目次">
      <h2 class="block__title">目次</h2>
      <ol>${chapters.map((c, i) => html`<li><button type="button" class="link" data-act="goto" data-target="m-${i}">${c.title}</button></li>`)}</ol>
    </nav>`;
  const text = chapters.map((c, i) => html`<section class="m-chapter" id="m-${i}"><h2>${c.title}</h2>${novel(c.body.replace(/\n-{3,}\s*$/, ''))}</section>`);
  return html`${toc}${page(ui.reading, text)}`;
};

export const reader = { render: (ctx) => (ctx.doc.id === 'manuscript' ? manuscript(ctx) : draft(ctx)) };
