import { html, unwrap } from './lib/html.js';
import { parse, href } from './lib/route.js';
import * as api from './lib/api.js';
import { emptyState } from './lib/ui.js';
import { home } from './views/home.js';
import { storyPage, missingStory } from './views/story.js';
import { LIVE_TEXT } from './views/rail.js';
import { SIZES } from './views/reader.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

/** 画面の状態はここと URL だけ。render(state) → HTML の一方向 */
const state = {
  route: parse(location.hash),
  stories: null,
  story: null,
  file: null,
  status: 'loading',
  error: null,
};

const ui = { menuOpen: false, live: 'ok', reading: loadReading() };

function loadReading() {
  const fallback = { size: 18, vertical: false };
  try {
    const saved = JSON.parse(localStorage.getItem('viewer.reading') ?? '{}');
    return { size: SIZES.includes(saved.size) ? saved.size : fallback.size, vertical: saved.vertical === true };
  } catch {
    return fallback;
  }
}
function saveReading() {
  try {
    localStorage.setItem('viewer.reading', JSON.stringify(ui.reading));
  } catch {
    /* 保存できなくても、その場の設定は効く */
  }
}

/* ---- データ取得 ---- */

let loadSeq = 0;
let signature = '';

async function fetchFor(route, { full }) {
  if (route.name === 'home') return { stories: await api.stories(), status: 'ready' };
  const reuse = !full && state.story?.name === route.story;
  const story = reuse ? state.story : await api.story(route.story);
  if (!story) return { story: null, file: null, status: 'missing' };
  const doc = story.docs.find((d) => d.id === route.docId);
  const file = doc?.path ? await api.file(route.story, doc.path) : null;
  return { story, file, status: 'ready' };
}

const hasDataFor = (r) => (r.name === 'home' ? state.stories !== null : state.story?.name === r.story);

async function load({ full = false, quiet = false } = {}) {
  const seq = ++loadSeq;
  const route = state.route;
  if (!quiet && !hasDataFor(route)) {
    state.status = 'loading';
    render();
  }
  let patch;
  try {
    patch = { ...(await fetchFor(route, { full })), error: null };
  } catch (e) {
    patch = { status: 'error', error: e.message };
  }
  if (seq !== loadSeq) return false;
  const next = JSON.stringify(patch);
  const changed = next !== signature;
  signature = next;
  Object.assign(state, patch);
  if (changed || state.status !== 'ready') render();
  return changed;
}

/* ---- 描画 ---- */

const loading = html`<div class="page"><p class="muted loading">読み込み中…</p></div>`;

function view() {
  const r = state.route;
  if (state.status === 'error') {
    return { html: html`<div class="page">${emptyState('サーバーに接続できません', state.error, html`<button type="button" class="btn" data-act="retry">もう一度読み込む</button>`)}</div>` };
  }
  if (r.name === 'home') return state.stories ? { html: home(state.stories, ui.live) } : { html: loading };
  if (state.status === 'missing') return { html: missingStory(r.story) };
  if (state.story?.name !== r.story) return { html: loading };
  return storyPage({ story: state.story, route: r, file: state.file, ui, replaceQuery });
}

let active = null;

function render() {
  const keep = capture();
  active?.unmount?.();
  active = view();
  app.innerHTML = unwrap(active.html);
  active.mount?.(app);
  document.title = titleOf();
  restore(keep);
}

function titleOf() {
  const r = state.route;
  if (r.name === 'home') return '物語ビューア';
  const doc = state.story?.docs.find((d) => d.id === r.docId);
  return `${doc && doc.id !== 'overview' ? `${doc.label} | ` : ''}${r.story} | 物語ビューア`;
}

/** 再描画しても読んでいる位置と操作中の要素を失わない */
function capture() {
  const el = document.activeElement;
  const focus = el && app.contains(el) ? (el.getAttribute('href') ? `[href="${CSS.escape(el.getAttribute('href'))}"]` : el.id ? `#${CSS.escape(el.id)}` : el.dataset.act ? `[data-act="${el.dataset.act}"]${el.dataset.v ? `[data-v="${el.dataset.v}"]` : ''}` : null) : null;
  const scrolls = [...app.querySelectorAll('[data-keep-scroll]')].map((e) => [e.dataset.keepScroll, e.scrollTop]);
  return { y: window.scrollY, focus, scrolls };
}

function restore({ y, focus, scrolls }) {
  scrolls.forEach(([id, top]) => {
    const e = app.querySelector(`[data-keep-scroll="${id}"]`);
    if (e) e.scrollTop = top;
  });
  if (focus) app.querySelector(focus)?.focus({ preventScroll: true });
  window.scrollTo(0, y);
}

/** 再描画せずに URL だけ更新する（スライダー操作など。履歴は増やさない） */
function replaceQuery(patch) {
  const r = state.route;
  const q = Object.fromEntries(Object.entries({ ...r.q, ...patch }).filter(([, v]) => v !== '' && v != null));
  state.route = { ...r, q };
  history.replaceState(null, '', href(r.story, r.docId, q));
}

/* ---- ルーティング ---- */

function onRoute() {
  const prev = state.route;
  const next = parse(location.hash);
  const moved = next.name !== prev.name || next.story !== prev.story || next.docId !== prev.docId;
  state.route = next;
  if (moved) {
    ui.menuOpen = false;
    state.status = hasDataFor(next) ? 'ready' : 'loading';
  }
  render();
  if (moved) {
    window.scrollTo(0, 0);
    load();
  }
}
window.addEventListener('hashchange', onRoute);

/* ---- 操作 ---- */

const ACTIONS = {
  menu: () => {
    ui.menuOpen = !ui.menuOpen;
    render();
  },
  font: (t) => {
    const i = SIZES.indexOf(ui.reading.size) + Number(t.dataset.v);
    ui.reading.size = SIZES[Math.min(Math.max(i, 0), SIZES.length - 1)];
    saveReading();
    render();
  },
  vertical: () => {
    ui.reading.vertical = !ui.reading.vertical;
    saveReading();
    render();
  },
  goto: (t) => document.getElementById(t.dataset.target)?.scrollIntoView({ block: 'start', inline: 'start' }),
  retry: () => load({ full: true }),
};

app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (t && app.contains(t)) ACTIONS[t.dataset.act]?.(t);
});

/* ハッシュはルーティングに使うので、スキップリンクはボタンで作る */
document.getElementById('skip').addEventListener('click', () => {
  const main = app.querySelector('#main') ?? app;
  main.setAttribute('tabindex', '-1');
  main.focus();
});

/* ---- ライブ更新 ---- */

let toastTimer = null;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2400);
}

function paintLive() {
  document.querySelectorAll('.live').forEach((el) => {
    el.className = `live live--${ui.live}`;
    el.textContent = LIVE_TEXT[ui.live];
  });
}

async function refresh(names = []) {
  const r = state.route;
  if (r.name === 'story' && names.length && !names.includes(r.story)) return;
  if (await load({ full: true, quiet: true })) toast('更新しました');
}

function connect() {
  const es = new EventSource('/api/events');
  es.addEventListener('change', (e) => refresh(JSON.parse(e.data).stories));
  es.onopen = () => {
    const wasLost = ui.live === 'lost';
    ui.live = 'ok';
    paintLive();
    if (wasLost) refresh();
  };
  es.onerror = () => {
    ui.live = 'lost';
    paintLive();
    if (es.readyState === EventSource.CLOSED) setTimeout(connect, 2000);
  };
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
window.__viewer = { refresh };

render();
load();
connect();
