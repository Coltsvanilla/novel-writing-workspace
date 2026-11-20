import { html, unwrap } from '../lib/html.js';
import { edgeAt, nodeAt } from '/shared/relations.js';
import { labelOf } from '/shared/chapters.js';
import { radialLayout } from '/shared/layout.js';
import { markdown } from '../lib/markdown.js';
import { chapterCount, emptyState } from '../lib/ui.js';
import { KIND, avatar } from './characters.js';

let teardown = null;
/** 章の表示名を引くための、いま開いている物語の章（render と mount で更新する） */
let CHAPTERS = [];

/** 図の上のラベルは短く切る。全文は右の詳細パネルで読める */
const clip = (s, n = 12) => (s.length > n ? `${s.slice(0, n)}…` : s);

const maxChapter = (s) => Math.max(chapterCount(s), ...s.rel.edges.flatMap((e) => e.timeline.map((t) => t.ch)), ...s.rel.nodes.map((n) => n.first), 0);
const nameOf = (rel, id) => rel.nodes.find((n) => n.id === id)?.display ?? '';
const clampCh = (v, max) => Math.min(Math.max(Number(v) || 0, 0), max);

function snapshot(rel, ch) {
  const nodes = new Map(rel.nodes.map((n) => [n.id, nodeAt(n, ch)]));
  const edges = rel.edges.map((e) => {
    const at = edgeAt(e, ch);
    const [a, b] = [nodes.get(e.a), nodes.get(e.b)];
    return { edge: e, ...at, visible: at.visible && a.visible && b.visible, dim: a.dim || b.dim };
  });
  return { nodes, edges };
}

const chLabel = (ch) => (ch === 0 ? '物語開始時点' : `${labelOf(CHAPTERS, ch)}の時点`);

function nodePanel(rel, node, ch) {
  const snap = snapshot(rel, ch);
  const links = snap.edges.filter((x) => x.visible && (x.edge.a === node.id || x.edge.b === node.id));
  return html`
    <header class="detail__head">
      ${avatar(node, 'avatar--lg')}
      <div>
        <h3 class="detail__name">${node.full}</h3>
        <p class="detail__role">${node.role || KIND[node.kind]}</p>
        <p><span class="pill pill--kind kind-${node.kind}">${KIND[node.kind]}</span></p>
      </div>
    </header>
    <p class="muted">${node.chapterText ? `登場：${node.chapterText}` : `初登場：${labelOf(CHAPTERS, node.first)}`}${snap.nodes.get(node.id).visible && snap.nodes.get(node.id).dim ? '（この章の時点ではまだ登場していません）' : ''}</p>
    <h4 class="panel__sub">つながり（${chLabel(ch)}）</h4>
    ${links.length
      ? html`<ul class="links">${links.map((x) => {
          const other = x.edge.a === node.id ? x.edge.b : x.edge.a;
          return html`<li><button type="button" class="link-row" data-sel="e:${x.edge.id}"><b>${nameOf(rel, other)}</b><span>${x.label || '関係の記載なし'}</span>${x.changedNow ? html`<span class="pill pill--changed">この章で変化</span>` : ''}</button></li>`;
        })}</ul>`
      : html`<p class="muted">この時点でのつながりはありません。</p>`}`;
}

function edgePanel(rel, edge, ch) {
  const at = edgeAt(edge, ch);
  const [a, b] = [nameOf(rel, edge.a), nameOf(rel, edge.b)];
  const base = edge.base;
  return html`
    <header class="panel__head">
      <h3 class="detail__name">${a} <span aria-hidden="true">↔</span><span class="sr">と</span> ${b}</h3>
      <p class="edge-now"><span class="muted">${chLabel(ch)}</span> ${at.visible ? at.label || '関係の記載なし' : html`<span class="muted">まだ関係が始まっていません（${labelOf(CHAPTERS, edge.since)}から）</span>`}</p>
    </header>
    <h4 class="panel__sub">はじまりの関係</h4>
    ${base
      ? html`
        <dl class="kv-list">
          <div><dt>関係</dt><dd>${base.rel}</dd></div>
          <div><dt>${base.aName} → ${base.bName}</dt><dd>${base.aToB}</dd></div>
          <div><dt>${base.bName} → ${base.aName}</dt><dd>${base.bToA}</dd></div>
          ${base.note ? html`<div><dt>備考</dt><dd>${base.note}</dd></div>` : ''}
        </dl>`
      : html`<p class="muted">開始時点の関係表には載っていません。${labelOf(CHAPTERS, edge.since)}から現れます。</p>`}
    <h4 class="panel__sub">章ごとの変化</h4>
    ${edge.timeline.length
      ? html`<ol class="changes">${edge.timeline.map((t) => {
          const when = t.ch < ch ? 'past' : t.ch === ch ? 'now' : 'future';
          return html`
            <li class="changes__item changes__item--${when}">
              <span class="changes__ch">${labelOf(CHAPTERS, t.ch)}<span class="changes__when">${{ past: '過去', now: 'この章', future: 'これから' }[when]}</span></span>
              <p class="changes__text">${t.before} <span aria-hidden="true">→</span><span class="sr">から</span> <b>${t.after}</b></p>
              ${t.trigger ? html`<p class="changes__why">きっかけ：${t.trigger}</p>` : ''}
            </li>`;
        })}</ol>`
      : html`<p class="muted">この関係は物語を通して変わりません。</p>`}`;
}

function chapterPanel(rel, ch) {
  const changed = snapshot(rel, ch).edges.filter((x) => x.changedNow && x.visible);
  return html`
    <h3 class="detail__name">${chLabel(ch)}</h3>
    <h4 class="panel__sub">この章で変化した関係</h4>
    ${changed.length
      ? html`<ul class="links">${changed.map((x) => {
          const t = x.edge.timeline.find((y) => y.ch === ch);
          return html`<li><button type="button" class="link-row link-row--changed" data-sel="e:${x.edge.id}"><b>${nameOf(rel, x.edge.a)} ↔ ${nameOf(rel, x.edge.b)}</b><span>${t.before} → ${t.after}</span></button></li>`;
        })}</ul>`
      : html`<p class="muted">${ch === 0 ? '開始時点の関係を表示しています。' : 'この章で変化した関係はありません。'}</p>`}
    <p class="hint">人物や線をクリックすると、ここに詳しい内容が出ます。</p>`;
}

function panel(rel, ch, sel) {
  const [type, id] = sel.split(':');
  const node = type === 'n' && rel.nodes.find((n) => n.id === id);
  const edge = type === 'e' && rel.edges.find((e) => e.id === id);
  if (node) return nodePanel(rel, node, ch);
  if (edge) return edgePanel(rel, edge, ch);
  return chapterPanel(rel, ch);
}

/** 目盛りの文字。長編で章が多いときは、選択中の章と各部の最初の章だけ名前を出す */
const tickText = (s, i, ch) => {
  if (i === 0) return '開始';
  const c = s.chapters.find((x) => x.no === i);
  if (!c || c.part === 0) return `第${i}章`;
  if (s.chapters.length <= 12 || i === ch) return c.label;
  return c.chNo === 1 ? `第${c.part}部` : '·';
};

function ticks(s, ch, max) {
  return html`${Array.from({ length: max + 1 }, (_, i) => html`<button type="button" class="ticks__btn ${i === ch ? 'is-on' : ''}" style="left:calc(10px + (100% - 20px) * ${max ? i / max : 0})" data-ch="${i}" title="${i === 0 ? '物語開始時点' : labelOf(s.chapters, i)}" ${i === ch ? html`aria-current="true"` : ''}>${tickText(s, i, ch)}</button>`)}`;
}

const legend = html`
  <ul class="legend legend--graph" aria-label="凡例">
    ${Object.entries(KIND).map(([k, label]) => html`<li><span class="swatch swatch--${k}"></span>${label}${k === 'mention' ? '（破線）' : ''}</li>`)}
    <li><span class="swatch swatch--changed"></span>この章で変化した線</li>
  </ul>`;

export const relations = {
  render({ story: s, file, q }) {
    CHAPTERS = s.chapters;
    const rel = s.rel;
    const rawTable = file ? html`<details class="block fold"><summary><h2 class="block__title">元の表（原文）</h2></summary><div class="prose">${markdown(file.text, { dropTitle: true })}</div></details>` : '';
    if (!rel.hasData) {
      return html`${emptyState('相関関係の表がまだありません', '04_relationships.md に「関係の一覧」の表を書くと、ここに相関図が出ます。')}${rawTable}`;
    }
    const max = maxChapter(s);
    const ch = clampCh(q.ch, max);
    const title = ch > 0 ? s.chapters.find((c) => c.no === ch)?.title : '';
    return html`
      <section class="relctl" aria-label="章の選択">
        <div class="relctl__head">
          <h2 class="relctl__title" id="rel-title">${chLabel(ch)}${title ? html`<span class="relctl__sub">「${title}」</span>` : ''}</h2>
          <p class="muted">スライダーで物語の進み具合を動かせます</p>
        </div>
        <div class="relctl__track">
          <input type="range" id="rel-range" min="0" max="${max}" step="1" value="${ch}" aria-label="何章の時点の関係を見るか" aria-valuetext="${chLabel(ch)}">
          <div class="ticks" id="rel-ticks">${ticks(s, ch, max)}</div>
        </div>
      </section>
      <div class="relbody">
        <div class="relbody__graph">
          <div class="graph" id="rel-graph" role="img" aria-label="登場人物の相関図。詳しい内容は右の一覧と人物ボタンで読めます"></div>
          ${legend}
          <div class="people" id="rel-people"></div>
        </div>
        <aside class="relbody__panel panel" id="rel-panel" aria-live="polite">${panel(rel, ch, q.sel ?? '')}</aside>
      </div>
      ${rawTable}`;
  },

  mount(root, ctx) {
    const { story: s } = ctx;
    CHAPTERS = s.chapters;
    const rel = s.rel;
    if (!rel.hasData || typeof cytoscape === 'undefined') return;
    const max = maxChapter(s);
    let ch = clampCh(ctx.q.ch, max);
    let sel = ctx.q.sel ?? '';
    const $ = (id) => root.querySelector(id);
    const [host, panelEl, range, tickEl, titleEl, peopleEl] = ['#rel-graph', '#rel-panel', '#rel-range', '#rel-ticks', '#rel-title', '#rel-people'].map($);
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

    const elements = [
      ...rel.nodes.map((n) => ({ group: 'nodes', data: { id: n.id, label: n.display, kind: n.kind } })),
      ...rel.edges.map((e) => ({ group: 'edges', data: { id: e.id, source: e.a, target: e.b, label: '' } })),
    ];

    const kindColor = (k) => css(`--kind-${k}`);
    const cy = cytoscape({
      container: host,
      elements,
      layout: { name: 'grid' },
      userZoomingEnabled: false,
      userPanningEnabled: false,
      boxSelectionEnabled: false,
      autoungrabify: true,
      zoom: 1,
      pan: { x: 0, y: 0 },
      style: [
        { selector: 'node', style: { label: 'data(label)', shape: 'round-rectangle', width: (n) => Math.max(52, [...n.data('label')].length * 15 + 26), height: 34, 'text-valign': 'center', 'text-halign': 'center', 'font-size': 14, 'font-weight': 600, 'font-family': '"Yu Gothic UI", Meiryo, system-ui, sans-serif', color: css('--on-kind'), 'background-color': css('--kind-support'), 'border-width': 2, 'border-color': css('--surface'), 'overlay-opacity': 0 } },
        ...Object.keys(KIND).filter((k) => k !== 'mention').map((k) => ({ selector: `node[kind="${k}"]`, style: { 'background-color': kindColor(k) } })),
        { selector: 'node[kind="mention"]', style: { 'background-color': css('--surface'), color: kindColor('mention'), 'border-style': 'dashed', 'border-color': kindColor('mention'), 'border-width': 2 } },
        { selector: 'edge', style: { width: 2.5, 'line-color': css('--graph-edge'), 'curve-style': 'bezier', label: 'data(label)', 'font-size': 11, 'font-family': '"Yu Gothic UI", Meiryo, system-ui, sans-serif', color: css('--ink-soft'), 'text-wrap': 'wrap', 'text-max-width': 84, 'text-background-color': css('--surface'), 'text-background-opacity': 0.92, 'text-background-padding': 3, 'text-background-shape': 'round-rectangle', 'text-events': 'yes', 'overlay-opacity': 0, 'overlay-padding': 6 } },
        { selector: 'edge.changed', style: { width: 5, 'line-color': css('--graph-changed'), color: css('--graph-changed'), 'font-weight': 700, 'z-index': 10 } },
        { selector: '.dim', style: { opacity: 0.32 } },
        { selector: '.hidden', style: { display: 'none' } },
        { selector: 'node.sel', style: { 'border-width': 4, 'border-color': css('--ink') } },
        { selector: 'edge.sel', style: { 'line-color': css('--ink'), width: 5, color: css('--ink') } },
      ],
    });

    const rootId = (rel.nodes.find((n) => n.kind === 'protagonist') ?? rel.nodes[0]).id;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let shown = new Set();

    /** 第N章の時点で見える人物だけで配置し直す。前の章でも見えていた人物は滑らかに動かす */
    const arrange = (snap, animate) => {
      const ids = rel.nodes.filter((n) => snap.nodes.get(n.id).visible).map((n) => n.id);
      const links = snap.edges.filter((x) => x.visible).map((x) => [x.edge.a, x.edge.b]);
      const pos = radialLayout({ ids, links, rootId, width: host.clientWidth, height: host.clientHeight });
      for (const id of ids) {
        const node = cy.getElementById(id);
        node.stop(true);
        if (animate && !calm && shown.has(id)) node.animate({ position: pos[id] }, { duration: 380, easing: 'ease-in-out-cubic' });
        else node.position(pos[id]);
      }
      shown = new Set(ids);
    };

    const paint = (animate = true) => {
      const snap = snapshot(rel, ch);
      cy.batch(() => {
        rel.nodes.forEach((n) => {
          const st = snap.nodes.get(n.id);
          cy.getElementById(n.id).toggleClass('hidden', !st.visible).toggleClass('dim', st.dim).toggleClass('sel', sel === `n:${n.id}`);
        });
        snap.edges.forEach((x) => {
          cy.getElementById(x.edge.id).data('label', clip(x.label)).toggleClass('hidden', !x.visible).toggleClass('changed', x.changedNow).toggleClass('dim', x.dim).toggleClass('sel', sel === `e:${x.edge.id}`);
        });
      });
      arrange(snap, animate);
      const title = ch > 0 ? s.chapters.find((c) => c.no === ch)?.title : '';
      titleEl.innerHTML = unwrap(html`${chLabel(ch)}${title ? html`<span class="relctl__sub">「${title}」</span>` : ''}`);
      range.value = ch;
      range.setAttribute('aria-valuetext', chLabel(ch));
      tickEl.innerHTML = unwrap(ticks(s, ch, max));
      panelEl.innerHTML = unwrap(panel(rel, ch, sel));
      peopleEl.innerHTML = unwrap(html`<span class="people__label">人物</span>${rel.nodes.filter((n) => snap.nodes.get(n.id).visible).map((n) => html`<button type="button" class="chip chip--btn ${sel === `n:${n.id}` ? 'is-on' : ''}" data-sel="n:${n.id}">${n.display}</button>`)}`);
    };

    const go = (next) => {
      if ('ch' in next) ch = next.ch;
      if ('sel' in next) sel = next.sel;
      paint();
      ctx.replaceQuery({ ch, sel });
      if (sel && panelEl.getBoundingClientRect().top > innerHeight - 140) panelEl.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'nearest' });
    };

    range.addEventListener('input', () => go({ ch: Number(range.value) }));
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-ch],[data-sel]');
      if (!t || !root.contains(t)) return;
      if (t.dataset.ch != null) go({ ch: Number(t.dataset.ch) });
      else go({ sel: sel === t.dataset.sel ? '' : t.dataset.sel });
    });
    cy.on('tap', (e) => {
      if (e.target === cy) go({ sel: '' });
      else go({ sel: `${e.target.isNode() ? 'n' : 'e'}:${e.target.id()}` });
    });

    const ro = new ResizeObserver(() => {
      cy.resize();
      cy.viewport({ zoom: 1, pan: { x: 0, y: 0 } });
      arrange(snapshot(rel, ch), false);
    });
    ro.observe(host);
    paint(false);
    teardown = () => {
      ro.disconnect();
      cy.destroy();
    };
  },

  unmount() {
    teardown?.();
    teardown = null;
  },
};
