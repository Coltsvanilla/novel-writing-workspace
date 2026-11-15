import { html } from '../lib/html.js';
import { href } from '../lib/route.js';
import { chapterCount, excerpt } from '../lib/ui.js';

export const KIND = { protagonist: '主人公', partner: '相棒', animal: '動物', support: '脇役', mention: '言及のみ' };

export const avatar = (c, size = '') => html`<span class="avatar avatar--${c.kind} ${size}" aria-hidden="true">${[...c.display][0]}</span>`;

const quotes = (lines) => lines.split(/、(?=「)/).filter(Boolean);

const dots = (c, n) => html`
  <span class="appear" role="img" aria-label="登場：${c.chapterText || 'なし'}">
    ${Array.from({ length: n }, (_, i) => {
      const ch = i + 1;
      const kind = c.chapters.main.includes(ch) ? 'main' : c.chapters.mention.includes(ch) ? 'mention' : 'none';
      return html`<span class="appear__dot appear__dot--${kind}" title="第${ch}章 ${{ main: '登場', mention: '言及', none: '出ない' }[kind]}"></span>`;
    })}
  </span>`;

const card = (s, c, n, selected) => html`
  <li>
    <a class="char ${selected ? 'is-selected' : ''}" href="${href(s.name, 'characters', { c: c.id })}" ${selected ? html`aria-current="true"` : ''}>
      <span class="char__head">
        ${avatar(c, 'avatar--lg')}
        <span class="char__names"><span class="char__name">${c.display}</span><span class="char__full">${c.full === c.display ? KIND[c.kind] : `${c.full}`}</span></span>
      </span>
      <span class="char__role">${c.role || KIND[c.kind]}</span>
      ${dots(c, n)}
      ${c.personality ? html`<span class="char__text">${excerpt(c.personality, 54)}</span>` : ''}
    </a>
  </li>`;

const detail = (c) => html`
  <aside class="detail" aria-label="${c.display}の詳細">
    <header class="detail__head">
      ${avatar(c, 'avatar--xl')}
      <div>
        <h2 class="detail__name">${c.full}</h2>
        <p class="detail__role">${c.role}</p>
        <p><span class="pill pill--kind kind-${c.kind}">${KIND[c.kind]}</span> <span class="muted">登場：${c.chapterText || '記載なし'}</span></p>
      </div>
    </header>
    ${c.voice
      ? html`
        <section class="detail__sec voice">
          <h3>魅力の方向</h3>
          <p class="voice__appeal">${c.voice.appeal}</p>
          <h3>代表的な台詞</h3>
          <ul class="quotes">${quotes(c.voice.lines).map((q) => html`<li>${q}</li>`)}</ul>
        </section>`
      : ''}
    ${c.profile.length ? html`<section class="detail__sec"><h3>プロフィール</h3><table class="kv"><tbody>${c.profile.map(([k, v]) => html`<tr><th scope="row">${k}</th><td>${v}</td></tr>`)}</tbody></table></section>` : ''}
    ${c.personality ? html`<section class="detail__sec"><h3>性格</h3><p>${c.personality}</p></section>` : ''}
    ${c.pronoun ? html`<section class="detail__sec"><h3>一人称</h3><p>${c.pronoun}</p></section>` : ''}
    ${c.extra.length
      ? html`
        <section class="detail__sec">
          <h3>追加情報</h3>
          <dl class="extra">
            ${c.extra.map((e) => html`<div><dt>${e.key}<span class="tag">${e.phase}</span></dt><dd>${e.text}</dd></div>`)}
          </dl>
        </section>`
      : ''}
  </aside>`;

const voices = (list) =>
  list.length
    ? html`
      <section class="block" aria-labelledby="voices">
        <h2 class="block__title" id="voices">台詞の方針</h2>
        <ul class="voices">
          ${list.map((c) => html`
            <li class="voices__item">
              ${avatar(c)}
              <div>
                <p class="voices__name">${c.display}<span class="muted"> ${c.role}</span></p>
                <p class="voices__appeal">${c.voice.appeal}</p>
                <ul class="quotes quotes--inline">${quotes(c.voice.lines).map((q) => html`<li>${q}</li>`)}</ul>
              </div>
            </li>`)}
        </ul>
      </section>`
    : '';

export const characters = {
  render({ story: s, q }) {
    const people = s.characters;
    if (!people.length) return html`<p class="muted">人物の一覧が見つかりません。</p>`;
    const n = chapterCount(s) || Math.max(...people.flatMap((c) => [...c.chapters.main, ...c.chapters.mention]), 1);
    const sel = people.find((c) => c.id === q.c) ?? people[0];
    return html`
      <div class="split">
        <div class="split__main">
          <ul class="grid grid--chars">${people.map((c) => card(s, c, n, c.id === sel.id))}</ul>
          <p class="legend"><span class="appear__dot appear__dot--main"></span>登場 <span class="appear__dot appear__dot--mention"></span>言及のみ <span class="appear__dot appear__dot--none"></span>出ない（左から第1章）</p>
        </div>
        ${detail(sel)}
      </div>
      ${voices(people.filter((c) => c.voice))}`;
  },
};
