'use strict';

/* ========== constants ========== */

const PHASES = [
  { n: 1, name: 'アイデア出し', file: '01_ideas.md' },
  { n: 2, name: '全体の章構成', file: '02_chapter-outline.md' },
  { n: 3, name: '登場人物の整理', file: '03_characters.md' },
  { n: 4, name: '相関関係図', file: '04_relationships.md' },
  { n: 5, name: '重要な物の整理', file: '05_key-items.md' },
  { n: 6, name: '章ごとの起承転結', dir: '06_chapter-plots/' },
  { n: 7, name: '章ごとの肉付け', dir: '07_chapters/' },
  { n: 8, name: '全体レビュー', file: '08_review.md' },
];
const MANUSCRIPT = '09_manuscript.md';

const STATUS_CLASS = {
  '未着手': 'st-todo', '作成中': 'st-wip', 'レビュー待ち': 'st-wait', '承認済み': 'st-done',
};
// Table cells that read as a status get a coloured badge.
const CELL_BADGE = Object.assign({
  'OK': 'st-done', '良好': 'st-done', '反映済み': 'st-done',
  '要修正': 'st-wait', '要改善': 'st-wait',
  '未対応': 'st-todo', '見送り': 'st-todo',
}, STATUS_CLASS);

/* ========== small helpers ========== */

const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function pref(key, fallback) {
  try { const v = localStorage.getItem('sv.' + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}
function setPref(key, value) {
  try { localStorage.setItem('sv.' + key, JSON.stringify(value)); } catch (e) { /* storage may be blocked */ }
}

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
async function getFile(story, path) {
  const r = await fetch('/api/file?story=' + encodeURIComponent(story) + '&path=' + encodeURIComponent(path), { cache: 'no-store' });
  if (!r.ok) return null;
  return r.text();
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ========== markdown renderer (no dependencies; all text is escaped) ========== */

function inline(raw) {
  const stash = [];
  let s = esc(raw);
  s = s.replace(/`([^`]+)`/g, (_, c) => { stash.push('<code>' + c + '</code>'); return '\u0000' + (stash.length - 1) + '\u0000'; });
  s = s.replace(/\{\{[^}]*\}\}/g, m => '<span class="ph">' + m + '</span>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim());
}

function cellHtml(text) {
  const key = text.replace(/\s/g, '');
  if (CELL_BADGE[key]) return '<span class="badge ' + CELL_BADGE[key] + '">' + esc(key) + '</span>';
  return inline(text);
}

function itemInner(text) {
  const m = text.match(/^\[( |x|X)\]\s+(.*)$/);
  if (m) return '<span class="cb">' + (m[1] === ' ' ? '☐' : '☑') + '</span>' + inline(m[2]);
  return inline(text);
}

function renderList(items) {
  let html = '';
  const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1].indent) {
      html += '</li></' + stack.pop().tag + '>';
    }
    const top = stack[stack.length - 1];
    if (!top || it.indent > top.indent) {
      const tag = it.ordered ? 'ol' : 'ul';
      html += '<' + tag + '>';
      stack.push({ indent: it.indent, tag });
    } else {
      html += '</li>';
    }
    html += '<li>' + itemInner(it.text);
  }
  while (stack.length) html += '</li></' + stack.pop().tag + '>';
  return html;
}

function renderMarkdown(md) {
  md = md.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  const isTableStart = k => k + 1 < lines.length && lines[k].trim().startsWith('|') && TABLE_SEP_RE.test(lines[k + 1]);
  const isBlockStart = k => {
    const l = lines[k];
    return /^#{1,6}\s/.test(l) || /^```/.test(l) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) ||
      /^>/.test(l) || LIST_RE.test(l) || isTableStart(k);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^```\s*(\S*)/);
    if (fence) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      const body = esc(code.join('\n'));
      out.push(fence[1] === 'mermaid' ? '<pre class="mermaid">' + body + '</pre>' : '<pre><code>' + body + '</code></pre>');
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); i++; continue; }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if (/^>/.test(line)) {
      const q = [];
      while (i < lines.length && /^>/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push('<blockquote>' + renderMarkdown(q.join('\n')) + '</blockquote>');
      continue;
    }

    if (isTableStart(i)) {
      const head = splitRow(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]));
      let t = '<div class="tablewrap"><table><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>';
      for (const r of rows) t += '<tr>' + r.map(c => '<td>' + cellHtml(c) + '</td>').join('') + '</tr>';
      out.push(t + '</tbody></table></div>');
      continue;
    }

    if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_RE);
        if (m) {
          items.push({ indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), text: m[3] });
          i++;
        } else if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) {
          items[items.length - 1].text += ' ' + lines[i].trim(); // wrapped continuation line
          i++;
        } else break;
      }
      out.push(renderList(items));
      continue;
    }

    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(i)) para.push(lines[i++]);
    out.push('<p>' + para.map(inline).join('<br>') + '</p>');
  }
  return out.join('\n');
}

let mermaidReady = false;
async function runMermaid(root) {
  const nodes = root.querySelectorAll('pre.mermaid');
  if (!nodes.length) return;
  for (let k = 0; k < 30 && !window.mermaid; k++) await new Promise(r => setTimeout(r, 100));
  if (!window.mermaid) { nodes.forEach(n => n.classList.add('mermaid-failed')); return; }
  if (!mermaidReady) {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
    mermaidReady = true;
  }
  try { await window.mermaid.run({ nodes }); } catch (e) { nodes.forEach(n => n.classList.add('mermaid-failed')); }
}

/* ========== progress.md parsing ========== */

function sectionOf(md, titleRe) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let start = -1, level = 0;
  for (let k = 0; k < lines.length; k++) {
    const m = lines[k].match(/^(#{1,6})\s+(.*)$/);
    if (m && titleRe.test(m[2].trim())) { start = k; level = m[1].length; break; }
  }
  if (start < 0) return '';
  let end = lines.length;
  for (let k = start + 1; k < lines.length; k++) {
    const m = lines[k].match(/^(#{1,6})\s/);
    if (m && m[1].length <= level) { end = k; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

function firstTable(text) {
  const lines = text.split('\n');
  const rows = [];
  let started = false;
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].trim().startsWith('|')) {
      started = true;
      if (TABLE_SEP_RE.test(lines[k])) continue;
      rows.push(splitRow(lines[k]));
    } else if (started) break;
  }
  return rows.slice(1); // drop the header row
}

const isPlaceholder = v => !v || /\{\{/.test(v);
const clean = v => (isPlaceholder(v) ? '' : v.replace(/\*\*/g, '').trim());

function parseProgress(md) {
  const res = { title: '', input: {}, style: [], phases: {}, chapters: [], changelog: '' };
  const t = md.match(/^#\s+(?:進捗管理[：:]\s*)?(.+)$/m);
  if (t) res.title = clean(t[1]);

  // Each input is either "- **最初：** text" or a label followed by indented sub-bullets (common for 補足).
  const inputLines = sectionOf(md, /^インプット/).split('\n');
  for (let k = 0; k < inputLines.length; k++) {
    const m = inputLines[k].match(/\*\*(最初|結末|補足)[^*]*\*\*\s*(.*)$/);
    if (!m) continue;
    const vals = [];
    if (clean(m[2])) vals.push(clean(m[2]));
    while (k + 1 < inputLines.length && /^\s+[-*]\s+/.test(inputLines[k + 1])) {
      k++;
      const v = clean(inputLines[k].replace(/^\s+[-*]\s+/, ''));
      if (v) vals.push(v);
    }
    res.input[m[1]] = vals;
  }

  for (const line of sectionOf(md, /^執筆方針/).split('\n')) {
    const m = line.match(/^\s*-\s*(.+?)[：:]\s*(.*)$/);
    if (m) res.style.push({ k: m[1], v: clean(m[2]) });
  }

  for (const r of firstTable(sectionOf(md, /^フェーズ進捗/))) {
    const n = parseInt(r[0], 10);
    if (n >= 1 && n <= 8) res.phases[n] = { status: (r[3] || '').replace(/\s/g, ''), date: r[4] || '' };
  }

  for (const r of firstTable(sectionOf(md, /^フェーズ7[：:]/))) {
    const n = parseInt((r[0] || '').replace(/\D/g, ''), 10);
    if (n) res.chapters.push({ n, label: r[0], title: clean(r[1]), status: (r[2] || '').replace(/\s/g, ''), date: r[3] || '' });
  }

  const log = sectionOf(md, /^変更履歴/);
  const rows = firstTable(log).filter(r => r.some(c => c));
  if (rows.length) res.changelog = log;
  return res;
}

/* ========== state ========== */

const state = { stories: [], root: '', sig: '', progress: {}, texts: {}, token: 0, lastKey: '' };

function parseRoute() {
  const h = location.hash.replace(/^#\//, '');
  if (!h) return { story: null, view: 'overview' };
  const idx = h.indexOf('/');
  const story = decodeURIComponent(idx < 0 ? h : h.slice(0, idx));
  const view = idx < 0 ? 'overview' : decodeURIComponent(h.slice(idx + 1)) || 'overview';
  return { story, view };
}
const hrefTo = (story, view) => '#/' + encodeURIComponent(story) + '/' + encodeURIComponent(view);

const storyByName = n => state.stories.find(s => s.name === n);
const hasFile = (story, path) => !!(storyByName(story) && storyByName(story).files.some(f => f.path === path));
const fileInfo = (story, path) => (storyByName(story) ? storyByName(story).files.find(f => f.path === path) : null);

function chapterNo(path) {
  const m = path.match(/ch(\d+)\.md$/i);
  return m ? parseInt(m[1], 10) : 0;
}

async function loadStories() {
  const data = await getJSON('/api/stories');
  state.stories = data.stories;
  state.root = data.root;
  const progress = {};
  await Promise.all(state.stories.map(async s => {
    const text = s.files.some(f => f.path === 'progress.md') ? await getFile(s.name, 'progress.md') : null;
    progress[s.name] = text ? parseProgress(text) : null;
  }));
  state.progress = progress;
}

/* ========== sidebar ========== */

function phaseStatus(story, n) {
  const p = state.progress[story];
  return p && p.phases[n] ? p.phases[n].status : '';
}
const statusClass = s => STATUS_CLASS[s] || 'st-todo';

function chapterFiles(story, dir) {
  const s = storyByName(story);
  return s ? s.files.filter(f => f.path.startsWith(dir)).sort((a, b) => chapterNo(a.path) - chapterNo(b.path) || a.path.localeCompare(b.path)) : [];
}

function chapterRow(story, n) {
  const p = state.progress[story];
  return p ? p.chapters.find(c => c.n === n) : null;
}

// Flat, ordered list of every viewable page (used for the sidebar and the prev/next pager).
function buildNav(story) {
  const items = [{ view: 'overview', label: '概要・進捗', icon: true }];
  for (const ph of PHASES) {
    if (ph.file) {
      items.push({ view: ph.file, label: ph.n + '. ' + ph.name, status: phaseStatus(story, ph.n), exists: hasFile(story, ph.file) });
    } else {
      items.push({ group: true, label: ph.n + '. ' + ph.name, status: phaseStatus(story, ph.n) });
      for (const f of chapterFiles(story, ph.dir)) {
        const n = chapterNo(f.path);
        const row = ph.n === 7 ? chapterRow(story, n) : null;
        items.push({
          view: f.path, child: true, exists: true,
          label: n ? '第' + n + '章' : f.path.split('/').pop(),
          sub: row ? row.title : '',
          status: row ? row.status : (ph.n === 6 ? phaseStatus(story, 6) : ''),
        });
      }
    }
  }
  items.push({ view: MANUSCRIPT, label: '完成稿', status: '', exists: hasFile(story, MANUSCRIPT) });
  return items;
}

function renderSide(route) {
  const side = $('#side');
  let html = '<div class="brand">物語ビューア<small>story-creator の成果物</small></div>';
  if (!state.stories.length) { side.innerHTML = html; return; }

  if (state.stories.length > 1) {
    html += '<select class="story-select" id="storySel" aria-label="物語を選ぶ">' +
      state.stories.map(s => '<option value="' + esc(s.name) + '"' + (s.name === route.story ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
      '</select>';
  } else {
    html += '<div class="brand" style="font-size:15px">' + esc(route.story) + '</div>';
  }

  html += '<ul class="nav">';
  for (const it of buildNav(route.story)) {
    if (it.group) {
      html += '<li class="group"><span class="dot ' + statusClass(it.status) + '"></span>' + esc(it.label) + '</li>';
      continue;
    }
    const cls = [it.view === route.view ? 'active' : '', it.exists === false ? 'missing' : ''].join(' ').trim();
    const dot = '<span class="dot ' + (it.icon ? 'none' : statusClass(it.status)) + '"></span>';
    html += '<li class="' + (it.child ? 'child' : '') + '"><a class="' + cls + '" href="' + hrefTo(route.story, it.view) + '">' + dot +
      '<span>' + esc(it.label) + '</span>' + (it.sub ? '<span class="ctitle">' + esc(it.sub) + '</span>' : '') + '</a></li>';
  }
  html += '</ul>';
  side.innerHTML = html;

  const sel = $('#storySel');
  if (sel) sel.addEventListener('change', () => { location.hash = hrefTo(sel.value, 'overview'); });
}

/* ========== overview ========== */

function waitingList(story) {
  const p = state.progress[story];
  const list = [];
  if (!p) return list;
  for (const ph of PHASES) {
    if (phaseStatus(story, ph.n) !== 'レビュー待ち') continue;
    if (ph.n === 7) {
      const rows = p.chapters.filter(c => c.status === 'レビュー待ち');
      if (rows.length) {
        for (const c of rows) list.push({ label: 'フェーズ7：第' + c.n + '章' + (c.title ? '「' + c.title + '」' : ''), view: '07_chapters/ch' + String(c.n).padStart(2, '0') + '.md' });
        continue;
      }
    }
    list.push({ label: 'フェーズ' + ph.n + '：' + ph.name, view: ph.file || ph.dir.replace(/\/$/, '') });
  }
  return list;
}

function firstViewOfDir(story, dir) {
  const f = chapterFiles(story, dir)[0];
  return f ? f.path : 'overview';
}

async function renderOverview(route, token) {
  const story = route.story;
  const p = state.progress[story];
  const files = storyByName(story).files;
  if (!p) {
    return '<h1 class="page-title">' + esc(story) + '</h1><div class="card notice">progress.md がまだありません。' +
      (files.length ? '' : 'サブモジュールが未取得の可能性があります（git submodule update --init）。') + '</div>';
  }

  let commits = [];
  try { commits = (await getJSON('/api/git?story=' + encodeURIComponent(story))).commits; } catch (e) { /* git is optional */ }
  if (token !== state.token) return null;

  const done = PHASES.filter(ph => phaseStatus(story, ph.n) === '承認済み').length;
  const waits = waitingList(story);
  const working = PHASES.filter(ph => phaseStatus(story, ph.n) === '作成中');

  let html = '<h1 class="page-title">' + esc(p.title || story) + '</h1>';
  html += '<p class="sub">フェーズ ' + done + ' / ' + PHASES.length + ' 承認済み</p>';
  html += '<div class="meter" role="img" aria-label="進捗 ' + done + '/' + PHASES.length + '"><span style="width:' + (done / PHASES.length * 100) + '%"></span></div>';

  if (waits.length) {
    html += '<div class="callout"><strong>あなたの確認待ちがあります</strong>内容を確認し、Claude のチャットで「承認」または修正の依頼を伝えてください。<ul>' +
      waits.map(w => '<li><a href="' + hrefTo(story, w.view === '06_chapter-plots' ? firstViewOfDir(story, '06_chapter-plots/') : w.view) + '">' + esc(w.label) + '</a></li>').join('') + '</ul></div>';
  } else if (done === PHASES.length) {
    html += '<div class="callout done"><strong>全フェーズが承認済みです</strong><a href="' + hrefTo(story, MANUSCRIPT) + '">完成稿を読む</a></div>';
  } else if (working.length) {
    html += '<div class="callout calm"><strong>Claude が作成中です</strong>フェーズ' + working.map(w => w.n + '：' + w.name).join('、') + '</div>';
  } else {
    html += '<div class="callout calm"><strong>次のフェーズの開始待ちです</strong>Claude のチャットで続きを進めてください。</div>';
  }

  html += '<h2 class="section-title">フェーズ</h2><div class="steps">';
  for (const ph of PHASES) {
    const st = phaseStatus(story, ph.n) || '未着手';
    const view = ph.file || firstViewOfDir(story, ph.dir);
    const d = p.phases[ph.n] && p.phases[ph.n].date && p.phases[ph.n].date !== '-' ? p.phases[ph.n].date : '';
    html += '<a class="step ' + statusClass(st) + '" href="' + hrefTo(story, view) + '"><div class="n">フェーズ' + ph.n + '</div><div class="t">' + esc(ph.name) +
      '</div><span class="badge ' + statusClass(st) + '">' + esc(st) + '</span>' + (d ? ' <span class="sub" style="margin:0">' + esc(d) + '</span>' : '') + '</a>';
  }
  html += '</div>';

  const kv = ['最初', '結末', '補足'].map(k => [k, p.input[k] || []]).filter(x => x[1].length);
  if (kv.length) {
    html += '<h2 class="section-title">インプット</h2><div class="kv">' + kv.map(x => '<div class="card"><h3>' + x[0] + '</h3>' +
      (x[1].length === 1 ? '<p>' + esc(x[1][0]) + '</p>' : '<ul style="margin:0;padding-left:1.2em">' + x[1].map(v => '<li>' + esc(v) + '</li>').join('') + '</ul>') +
      '</div>').join('') + '</div>';
  }

  const style = p.style.filter(x => x.v);
  if (style.length) {
    html += '<h2 class="section-title">執筆方針</h2><div class="kv">' + style.map(x => '<div class="card"><h3>' + esc(x.k) + '</h3><p>' + esc(x.v) + '</p></div>').join('') + '</div>';
  }

  const chapters = p.chapters.filter(c => c.title || c.status !== '未着手');
  if (chapters.length) {
    html += '<h2 class="section-title">フェーズ7：章ごとの状況</h2><div class="chapters">';
    for (const c of chapters) {
      const path = '07_chapters/ch' + String(c.n).padStart(2, '0') + '.md';
      html += '<a class="chrow" href="' + hrefTo(story, path) + '"><span>第' + c.n + '章</span><span>' + esc(c.title) + '</span><span class="d">' +
        esc(c.date && c.date !== '-' ? c.date : '') + '</span><span class="badge ' + statusClass(c.status) + '">' + esc(c.status || '未着手') + '</span></a>';
    }
    html += '</div>';
  }

  if (p.changelog) html += '<h2 class="section-title">変更履歴</h2><div class="md">' + renderMarkdown(p.changelog) + '</div>';

  if (commits.length) {
    html += '<h2 class="section-title">コミット履歴（承認の記録）</h2><ul class="timeline">' +
      commits.map(c => '<li><div>' + esc(c.subject) + '</div><div class="meta">' + esc(fmtDate(c.date)) + ' · <code>' + esc(c.hash) + '</code></div></li>').join('') + '</ul>';
  }
  return html;
}

/* ========== artifact page ========== */

function extractBody(text) {
  const t = text.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const m = t.match(/^##\s*本文\s*$/m);
  if (!m) return null;
  const rest = t.slice(m.index + m[0].length);
  const end = rest.search(/^---\s*$|^##\s+/m);
  return {
    body: (end < 0 ? rest : rest.slice(0, end)).trim(),
    memo: end < 0 ? '' : rest.slice(end).replace(/^---\s*$/m, '').trim(),
  };
}

function artifactTitle(text, fallback) {
  const m = text.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

async function renderArtifact(route, token) {
  const { story, view } = route;
  const nav = buildNav(story).filter(x => x.view && x.exists !== false);
  const idx = nav.findIndex(x => x.view === view);
  const info = fileInfo(story, view);

  if (!info) {
    return '<div class="card notice">このファイルはまだ作成されていません。<br><small>' + esc(view) + '</small></div>' +
      '<div class="pager"><a class="btn" href="' + hrefTo(story, 'overview') + '">概要に戻る</a></div>';
  }

  const text = await getFile(story, view);
  if (token !== state.token) return null;
  if (text === null) return '<div class="card notice">ファイルを読み込めませんでした。</div>';

  const isChapter = /^07_chapters\/ch\d+\.md$/i.test(view);
  const raw = !!pref('raw', false);
  const vertical = !!pref('vertical', false);
  const fs = pref('fs', 17);
  const status = isChapter ? (chapterRow(story, chapterNo(view)) || {}).status : phaseStatusForFile(story, view);

  let html = '<div class="toolbar">' +
    (status ? '<span class="badge ' + statusClass(status) + '">' + esc(status) + '</span>' : '') +
    '<span class="sub" style="margin:0">' + esc(view) + ' · 更新 ' + esc(fmtDate(info.mtime)) + '</span><span class="spacer"></span>';
  if (isChapter && !raw) {
    html += '<button class="btn' + (vertical ? ' on' : '') + '" data-act="vertical">縦書き</button>' +
      '<button class="btn" data-act="fs-" aria-label="文字を小さく">A−</button><button class="btn" data-act="fs+" aria-label="文字を大きく">A＋</button>';
  }
  html += '<button class="btn' + (raw ? ' on' : '') + '" data-act="raw">原文を表示</button></div>';

  if (raw) {
    html += '<pre class="card" style="white-space:pre-wrap;word-break:break-word">' + esc(text) + '</pre>';
  } else if (isChapter && extractBody(text)) {
    const parts = extractBody(text);
    html += '<h1 class="page-title">' + esc(artifactTitle(text, view)) + '</h1>';
    html += '<div class="reader md' + (vertical ? ' vertical' : '') + '" style="--fs:' + fs + 'px">' + renderMarkdown(parts.body) + '</div>';
    if (parts.memo) html += '<details class="memo md"><summary>肉付けメモ（本文には含まれません）</summary>' + renderMarkdown(parts.memo) + '</details>';
  } else {
    html += '<div class="md">' + renderMarkdown(text) + '</div>';
  }

  html += '<div class="pager">' +
    (idx > 0 ? '<a class="btn" href="' + hrefTo(story, nav[idx - 1].view) + '">← ' + esc(nav[idx - 1].label) + '</a>' : '<span></span>') +
    (idx >= 0 && idx < nav.length - 1 ? '<a class="btn" href="' + hrefTo(story, nav[idx + 1].view) + '">' + esc(nav[idx + 1].label) + ' →</a>' : '<span></span>') + '</div>';
  return html;
}

function phaseStatusForFile(story, path) {
  const ph = PHASES.find(x => x.file === path || (x.dir && path.startsWith(x.dir)));
  return ph ? phaseStatus(story, ph.n) : '';
}

/* ========== render loop ========== */

async function render(keepScroll) {
  const token = ++state.token;
  let route = parseRoute();

  if (!state.stories.length) {
    $('#side').innerHTML = '<div class="brand">物語ビューア<small>story-creator の成果物</small></div>';
    $('#content').innerHTML = '<h1 class="page-title">物語がまだありません</h1><div class="card notice">Claude Code で story-creator スキルを使って物語を始めると、ここに表示されます。<br>' +
      '<small>監視先：' + esc(state.root) + '</small></div>';
    return;
  }
  if (!route.story || !storyByName(route.story)) {
    route = { story: state.stories[0].name, view: 'overview' };
    history.replaceState(null, '', hrefTo(route.story, 'overview'));
  }

  renderSide(route);
  const scrollY = window.scrollY;
  const reader = $('.reader.vertical');
  const readerLeft = reader ? reader.scrollLeft : 0;

  const html = route.view === 'overview' ? await renderOverview(route, token) : await renderArtifact(route, token);
  if (html === null || token !== state.token) return; // a newer render superseded this one

  const content = $('#content');
  content.innerHTML = html;
  document.title = (route.view === 'overview' ? route.story : route.view) + ' | 物語ビューア';

  if (keepScroll) {
    window.scrollTo(0, scrollY);
    const r2 = $('.reader.vertical');
    if (r2) r2.scrollLeft = readerLeft;
  } else {
    window.scrollTo(0, 0);
  }
  runMermaid(content);
}

/* ========== events ========== */

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'raw') setPref('raw', !pref('raw', false));
  else if (act === 'vertical') setPref('vertical', !pref('vertical', false));
  else if (act === 'fs+') setPref('fs', Math.min(28, pref('fs', 17) + 1));
  else if (act === 'fs-') setPref('fs', Math.max(12, pref('fs', 17) - 1));
  render(true);
});

window.addEventListener('hashchange', () => render(false));

async function poll() {
  try {
    const v = await getJSON('/api/version');
    $('#conn').hidden = true;
    if (v.sig !== state.sig) {
      const first = state.sig === '';
      state.sig = v.sig;
      await loadStories();
      await render(!first);
      if (!first) {
        toast('更新を反映しました');
        // The commit usually lands a moment after the files change; refresh the history once more.
        setTimeout(() => { if (parseRoute().view === 'overview') render(true); }, 4000);
      }
    }
  } catch (e) {
    $('#conn').hidden = false;
  }
}

poll();
setInterval(poll, 2000);
