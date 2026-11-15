/**
 * 物語フォルダのMarkdown群 → 画面が読む型付きモデル。
 * 入力は「相対パス → 本文」の写し（ディスクにも git にも依存しない）。
 *
 * @typedef {'approved'|'review'|'wip'|'todo'} StatusKey
 * @typedef {{ key: StatusKey, label: string }} Status
 * @typedef {{ no: number, name: string, file: string, status: Status, statusText: string, date: string }} Phase
 * @typedef {{ no: number, title: string, summary: string, role: string, status: Status, date: string, hasPlot: boolean, hasDraft: boolean, chars: number }} Chapter
 * @typedef {{ id: string, label: string, group: string, path: string|null, status: Status|null, changes: null|'modified'|'new'|'deleted' }} Doc
 *   id は overview | ideas | outline | characters | relations | items | plot-N | draft-N | review | manuscript
 * @typedef {{ id: string, full: string, display: string, aliases: string[], role: string, kind: 'protagonist'|'partner'|'animal'|'support'|'mention',
 *   chapters: { main: number[], mention: number[] }, chapterText: string, profile: [string,string][], personality: string, pronoun: string,
 *   extra: { phase: string, key: string, text: string }[], voice: { appeal: string, lines: string }|null,
 *   first: number, exit: number|null, initial: boolean }} Character
 * @typedef {{ id: string, a: string, b: string, since: number,
 *   base: { rel: string, aToB: string, bToA: string, note: string, aName: string, bName: string }|null,
 *   timeline: { ch: number, before: string, after: string, trigger: string }[] }} Edge
 * @typedef {{ name: string, role: string, first: string, resolved: string, props: [string,string][],
 *   track: { ch: number, owner: string, state: string, note: string }[] }} Item
 * @typedef {{ id: string, sev: string, where: string, what: string, fix: string, state: string }} Finding
 * @typedef {{ summary: string, checks: Record<string,string>[], good: string[], findings: Finding[], foreshadow: Record<string,string>[], applied: string }} Review
 * @typedef {{ name: string, input: { first: string, last: string }, extras: string[], policy: string[],
 *   phases: Phase[], chapters: Chapter[], log: Record<string,string>[],
 *   progress: { approved: number, total: number, pct: number, current: Phase|null },
 *   awaiting: { label: string, docId: string }[], docs: Doc[], totalChars: number,
 *   characters: Character[], rel: { nodes: Character[], edges: Edge[], entrances: Record<string,string>[], hasData: boolean },
 *   items: Item[], review: Review|null }} Story
 */
import { parseTables, splitSections, bullets, col, strip, nums } from './md.js';

const STATUSES = [
  { key: 'approved', label: '承認済み', test: /^承認/ },
  { key: 'review', label: '確認待ち', test: /^レビュー待ち/ },
  { key: 'wip', label: '作成中', test: /^作成中/ },
  { key: 'todo', label: '未着手', test: /./ },
];
/** @returns {Status} */
export function statusOf(text) {
  const s = STATUSES.find((x) => x.test.test((text ?? '').trim())) ?? STATUSES[3];
  return { key: s.key, label: s.label };
}

const pad = (n) => String(n).padStart(2, '0');

/** 「第1〜5章（第6章は回想）」「第1章・第6章（言及）」を、本編に出る章と言及だけの章に分ける */
export function parseChapterSpec(text, roleText = '') {
  const [main = '', ...rest] = text.split('（');
  const sub = rest.join('（');
  const expand = (s) => {
    const set = new Set();
    const t = s.replace(/(\d+)〜(\d+)/g, (_, a, b) => {
      for (let i = +a; i <= +b; i++) set.add(i);
      return ' ';
    });
    nums(t).forEach((n) => set.add(n));
    return set;
  };
  const mentionOnly = /言及のみ/.test(text + roleText) || /^言及[）)]?$/.test(sub.trim());
  const mainSet = mentionOnly ? new Set() : expand(main);
  const mention = expand(mentionOnly ? text : sub);
  mainSet.forEach((n) => mention.delete(n));
  return { main: [...mainSet].sort((a, b) => a - b), mention: [...mention].sort((a, b) => a - b) };
}

function kindOf(role) {
  if (/主人公/.test(role)) return 'protagonist';
  if (/相棒/.test(role)) return 'partner';
  if (/馬/.test(role.replace(/馬車/g, ''))) return 'animal';
  if (/言及のみ|故人/.test(role)) return 'mention';
  return 'support';
}

/**
 * @param {string} name
 * @param {Record<string,string>} files 相対パス（/区切り） → 本文
 * @returns {Story}
 */
export function loadStory(name, files) {
  const progressMd = files['progress.md'] ?? '';
  const pt = parseTables(progressMd);

  /* 進捗 */
  const phases = (pt.find((t) => t.headers.includes('フェーズ') && t.headers.includes('状態'))?.rows ?? []).map((r) => ({
    no: Number(r['#']), name: r['フェーズ'], file: r['成果物'], status: statusOf(r['状態']), statusText: r['状態'], date: r['承認日'],
  }));
  const chapterStatusRows = pt.find((t) => t.headers.includes('章') && t.headers.includes('状態') && t.headers.includes('タイトル'))?.rows ?? [];
  const log = pt.find((t) => t.headers.includes('日付') && t.headers.includes('内容'))?.rows ?? [];
  const inputBullets = bullets(progressMd, 'インプット');
  const pick = (k) => inputBullets.find((b) => b.startsWith(`${k}：`))?.slice(k.length + 1).trim() ?? '';
  const approved = phases.filter((p) => p.status.key === 'approved').length;

  /* 章 */
  const outlineRows = parseTables(files['02_chapter-outline.md']).find((t) => t.headers.includes('章') && t.headers.some((h) => h.startsWith('タイトル')))?.rows ?? [];
  const chNos = new Set(outlineRows.map((r) => nums(r['章'])[0]));
  for (const p of Object.keys(files)) {
    const m = p.match(/^0[67]_chapter[\w-]*\/ch(\d+)\.md$/);
    if (m) chNos.add(Number(m[1]));
  }
  const chapters = [...chNos].filter(Boolean).sort((a, b) => a - b).map((n) => {
    const o = outlineRows.find((r) => nums(r['章'])[0] === n) ?? {};
    const s = chapterStatusRows.find((r) => nums(r['章'])[0] === n);
    const draft = files[`07_chapters/ch${pad(n)}.md`];
    const body = draft ? splitSections(draft, 2).find((x) => x.title === '本文')?.body ?? '' : '';
    return {
      no: n,
      title: strip(s?.['タイトル'] ?? col(o, 'タイトル') ?? ''),
      summary: strip(col(o, '概要')),
      role: strip(col(o, '物語全体での役割') || col(o, '起承転結')).split('：')[0].slice(0, 10),
      status: statusOf(s?.['状態']),
      date: s?.['承認日'] ?? '',
      hasPlot: `06_chapter-plots/ch${pad(n)}.md` in files,
      hasDraft: draft !== undefined,
      chars: body.replace(/\s/g, '').length,
    };
  });

  /* 人物 */
  const ct = parseTables(files['03_characters.md']);
  const listRows = ct.find((t) => t.h2 === '人物一覧')?.rows ?? [];
  const voiceRows = ct.find((t) => t.h2.startsWith('台詞の書き方'))?.rows ?? [];
  const charSections = splitSections(files['03_characters.md'], 2).filter((s) => s.title && s.title !== '人物一覧' && !s.title.startsWith('台詞の書き方'));
  /** @type {Character[]} */
  const characters = listRows.map((r, i) => {
    const full = strip(r['名前']);
    const clean = full.replace(/（.*?）/g, '');
    const nick = full.match(/愛称[：:]?\s*([^）)]+)/)?.[1];
    const parts = clean.split('・');
    const aliases = [...new Set([clean, parts[0], nick].filter(Boolean))];
    const section = charSections.find((s) => {
      const t = s.title.replace(/（.*?）/g, '');
      return aliases.includes(t) || t.split('・').some((p) => aliases.includes(p.trim()));
    });
    const sub = section ? splitSections(section.body, 3) : [];
    const get = (t) => sub.find((x) => x.title.startsWith(t))?.body ?? '';
    const profile = parseTables(`### p\n${get('プロフィール')}`)[0]?.rows ?? [];
    const extra = parseTables(`### p\n${get('その他の追加情報')}`)[0]?.rows ?? [];
    const role = strip(r['役割']);
    const chapterText = strip(col(r, '主に'));
    const voice = voiceRows.find((v) => aliases.includes(strip(v['人物'] ?? '')));
    return {
      id: `c${i}`, full, display: nick ?? parts[0], aliases, role, kind: kindOf(role),
      chapters: parseChapterSpec(chapterText, role), chapterText,
      profile: profile.map((x) => [strip(x['項目']), strip(x['内容'])]),
      personality: get('性格'), pronoun: get('一人称'),
      extra: extra.map((x) => ({ phase: strip(col(x, '追加したフェーズ')), key: strip(x['項目'] ?? ''), text: strip(x['内容']) })),
      voice: voice ? { appeal: strip(col(voice, '魅力')), lines: strip(col(voice, '本文に入れた')) } : null,
      first: 1, exit: null, initial: false,
    };
  });

  /* 関係 */
  const rt = parseTables(files['04_relationships.md']);
  const relRows = rt.find((t) => t.headers.includes('人物A') && t.headers.includes('関係'))?.rows ?? [];
  const changeRows = rt.find((t) => t.headers.includes('変化前'))?.rows ?? [];
  const entranceRows = rt.find((t) => t.headers.includes('初登場の章'))?.rows ?? [];
  const nodes = [...characters];
  const resolve = (raw) => {
    const n = strip(raw).replace(/（.*?）/g, '').trim();
    let c = nodes.find((x) => x.aliases.includes(n)) ?? nodes.find((x) => x.aliases.some((a) => a.startsWith(n) || n.startsWith(a)));
    if (!c) {
      c = { id: `x${nodes.length}`, full: n, display: n, aliases: [n], role: '', kind: 'support', chapters: { main: [], mention: [] }, chapterText: '', profile: [], personality: '', pronoun: '', extra: [], voice: null, first: 1, exit: null, initial: false };
      nodes.push(c);
    }
    return c;
  };
  /** @type {Edge[]} */
  const edges = [];
  const edgeFor = (a, b, since) => {
    let e = edges.find((x) => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id));
    if (!e) { e = { id: `e${edges.length}`, a: a.id, b: b.id, since, base: null, timeline: [] }; edges.push(e); }
    return e;
  };
  for (const r of relRows) {
    const A = resolve(r['人物A']);
    for (const nm of strip(r['人物B']).split(/[、,]/)) {
      const B = resolve(nm);
      const e = edgeFor(A, B, 0);
      e.since = 0;
      e.base = { rel: strip(r['関係']), aToB: strip(r['AからBへの感情']), bToA: strip(r['BからAへの感情']), note: strip(r['備考']), aName: A.display, bName: B.display };
    }
  }
  for (const r of changeRows) {
    const ch = nums(r['章'])[0];
    if (!ch) continue;
    const A = resolve(r['人物A']);
    for (const nm of strip(r['人物B']).split(/[、,]/)) {
      edgeFor(A, resolve(nm), ch).timeline.push({ ch, before: strip(r['変化前']), after: strip(r['変化後']), trigger: strip(r['きっかけ']) });
    }
  }
  for (const e of edges) {
    e.timeline.sort((x, y) => x.ch - y.ch);
    if (!e.base && e.timeline.length) e.since = e.timeline[0].ch;
  }
  for (const r of entranceRows) {
    const c = resolve(r['人物']);
    const firsts = nums(col(r, '初登場の章'));
    if (firsts.length) c.first = Math.min(...firsts);
    c.exit = nums(col(r, '退場の章'))[0] ?? null;
  }
  const inInitial = new Set(edges.filter((e) => e.since === 0).flatMap((e) => [e.a, e.b]));
  for (const n of nodes) {
    n.initial = inInitial.has(n.id);
    if (!entranceRows.length) { const all = [...n.chapters.main, ...n.chapters.mention]; n.first = all.length ? Math.min(...all) : 1; }
  }

  /* 重要な物 */
  const kt = parseTables(files['05_key-items.md']);
  const itemSections = splitSections(files['05_key-items.md'], 2).filter((s) => s.title && s.title !== '一覧');
  /** @type {Item[]} */
  const items = (kt.find((t) => t.h2 === '一覧')?.rows ?? []).map((r) => {
    const nm = strip(r['名前']);
    const tables = parseTables(itemSections.find((s) => s.title === nm)?.body ?? '');
    const track = tables.find((t) => t.headers.some((h) => h.startsWith('持ち主')));
    const props = tables.find((t) => t.headers.includes('項目'));
    return {
      name: nm, role: strip(r['役割（一言）']), first: strip(r['初出の章']), resolved: strip(r['回収される章']),
      props: (props?.rows ?? []).map((x) => [strip(x['項目']), strip(x['内容'])]),
      track: (track?.rows ?? []).map((x) => ({ ch: nums(x['章'])[0], owner: strip(col(x, '持ち主')), state: strip(col(x, '状態')), note: strip(x['備考']) })),
    };
  });

  /* レビュー */
  let review = null;
  if (files['08_review.md']) {
    const md = files['08_review.md'];
    const tables = parseTables(md);
    const secs = splitSections(md, 2);
    const sec = (t) => secs.find((s) => s.title.startsWith(t))?.body ?? '';
    review = {
      summary: sec('総評'),
      checks: tables.find((t) => t.h2.startsWith('観点別'))?.rows ?? [],
      good: sec('良かった点').split('\n').filter((l) => l.startsWith('- ')).map((l) => strip(l.slice(2))),
      findings: (tables.find((t) => t.h2.startsWith('指摘事項'))?.rows ?? []).filter((r) => r['ID']).map((r) => ({
        id: r['ID'], sev: col(r, '重大度'), where: strip(col(r, '場所')), what: strip(r['内容']), fix: strip(col(r, '修正案')), state: strip(col(r, '対応')),
      })),
      foreshadow: tables.find((t) => t.h2.startsWith('伏線'))?.rows ?? [],
      applied: sec('反映結果'),
    };
  }

  /* 文書一覧（ナビゲーションの単位） */
  const phaseStatus = (no) => phases.find((p) => p.no === no)?.status ?? null;
  const has = (p) => p in files;
  /** @type {Doc[]} */
  const docs = [
    { id: 'overview', label: '概要・進捗', group: '', path: 'progress.md', status: null },
    { id: 'ideas', label: 'アイデア', group: 'フェーズ1', path: has('01_ideas.md') ? '01_ideas.md' : null, status: phaseStatus(1) },
    { id: 'outline', label: '章構成', group: 'フェーズ2', path: has('02_chapter-outline.md') ? '02_chapter-outline.md' : null, status: phaseStatus(2) },
    { id: 'characters', label: '登場人物', group: 'フェーズ3', path: has('03_characters.md') ? '03_characters.md' : null, status: phaseStatus(3) },
    { id: 'relations', label: '相関関係図', group: 'フェーズ4', path: has('04_relationships.md') ? '04_relationships.md' : null, status: phaseStatus(4) },
    { id: 'items', label: '重要な物', group: 'フェーズ5', path: has('05_key-items.md') ? '05_key-items.md' : null, status: phaseStatus(5) },
    ...chapters.filter((c) => c.hasPlot).map((c) => ({ id: `plot-${c.no}`, label: `第${c.no}章 起承転結`, group: 'フェーズ6', path: `06_chapter-plots/ch${pad(c.no)}.md`, status: phaseStatus(6) })),
    ...chapters.filter((c) => c.hasDraft).map((c) => ({ id: `draft-${c.no}`, label: `第${c.no}章「${c.title}」`, group: 'フェーズ7', path: `07_chapters/ch${pad(c.no)}.md`, status: c.status })),
    { id: 'review', label: '全体レビュー', group: 'フェーズ8', path: has('08_review.md') ? '08_review.md' : null, status: phaseStatus(8) },
    { id: 'manuscript', label: '完成稿', group: 'フェーズ8', path: has('09_manuscript.md') ? '09_manuscript.md' : null, status: phaseStatus(8) },
  ].map((d) => ({ ...d, changes: null }));

  const awaiting = [
    ...phases.filter((p) => p.status.key === 'review').map((p) => ({ label: `フェーズ${p.no}：${p.name}`, docId: phaseDocId(p.no, chapters) })),
    ...chapters.filter((c) => c.status.key === 'review').map((c) => ({ label: `第${c.no}章「${c.title}」の本文`, docId: `draft-${c.no}` })),
  ];

  return {
    name,
    input: { first: pick('最初'), last: pick('結末') },
    extras: inputBullets.filter((b) => /^(ジャンル|長さ|読後感|主人公|トーン)/.test(b)),
    policy: bullets(progressMd, '執筆方針'),
    phases, chapters, log,
    progress: { approved, total: phases.length, pct: phases.length ? Math.round((approved / phases.length) * 100) : 0, current: phases.find((p) => p.status.key !== 'approved') ?? null },
    awaiting, docs,
    totalChars: chapters.reduce((a, c) => a + c.chars, 0),
    characters,
    rel: { nodes, edges, entrances: entranceRows, hasData: relRows.length + changeRows.length > 0 },
    items, review,
  };
}

function phaseDocId(no, chapters) {
  const first = (prefix) => (chapters[0] ? `${prefix}-${chapters[0].no}` : 'overview');
  return ({ 1: 'ideas', 2: 'outline', 3: 'characters', 4: 'relations', 5: 'items', 6: first('plot'), 7: first('draft'), 8: 'review' })[no] ?? 'overview';
}
