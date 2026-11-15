import { html } from '../lib/html.js';

const timeline = (track) => html`
  <ol class="track" aria-label="章ごとの所在と状態">
    ${track.map((t, i) => {
      const changed = i > 0 && t.state !== track[i - 1].state;
      return html`
        <li class="track__cell ${changed ? 'is-changed' : ''}">
          <span class="track__ch">第${t.ch}章</span>
          <span class="track__state">${t.state}${changed ? html`<span class="sr">（前の章から変化）</span>` : ''}</span>
          <span class="track__owner">${t.owner}</span>
          ${t.note ? html`<span class="track__note">${t.note}</span>` : ''}
        </li>`;
    })}
  </ol>`;

const card = (it) => html`
  <article class="item">
    <header class="item__head">
      <h2 class="item__name">${it.name}</h2>
      <p class="item__role">${it.role}</p>
      <p class="item__span"><span class="pill">初出 ${it.first || '未定'}</span><span aria-hidden="true">→</span><span class="pill pill--resolve">回収 ${it.resolved || '未定'}</span></p>
    </header>
    ${it.props.length ? html`<dl class="props">${it.props.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : ''}
    ${it.track.length ? html`<h3 class="item__sub">章ごとの所在・状態</h3>${timeline(it.track)}` : ''}
  </article>`;

export const items = {
  render: ({ story: s }) => (s.items.length ? html`<div class="stack">${s.items.map(card)}</div>` : html`<p class="muted">重要な物の一覧が見つかりません。</p>`),
};
