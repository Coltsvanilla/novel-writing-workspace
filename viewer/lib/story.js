/**
 * 物語フォルダのMarkdown群 → 画面が読む型付きモデル。
 * 入力は「相対パス → 本文」の写し（ディスクにも git にも依存しない）。
 *
 * @typedef {'approved'|'review'|'wip'|'todo'} StatusKey
 * @typedef {{ key: StatusKey, label: string }} Status
 * @typedef {{ no: number, name: string, file: string, status: Status, statusText: string, date: string }} Phase
 * @typedef {{ no: number, part: number, chNo: number, label: string, title: string, summary: string, role: string, status: Status, date: string, hasPlot: boolean, hasDraft: boolean, chars: number, plotPath: string, draftPath: string }} Chapter
 * @typedef {{ no: number, title: string, summary: string, role: string, steps: { label: string, status: Status }[], status: Status, chapters: number[], chars: number }} Part
 * @typedef {{ id: string, label: string, group: string, path: string|null, status: Status|null, changes: null|'modified'|'new'|'deleted' }} Doc
 *   id は overview | state | ideas | outline | partoutline-P | characters | relations | items | plot-N | draft-N | partreview-P | review | manuscript
 *   （N は物語全体の通し番号。長編モードでは「第P部 第M章」を、部→章の順に1から数えた番号）
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
 * @typedef {{ name: string, mode: 'short'|'long', input: { first: string, last: string }, extras: string[], policy: string[],
 *   phases: Phase[], chapters: Chapter[], parts: Part[], log: Record<string,string>[],
 *   progress: { approved: number, total: number, pct: number, current: Phase|null },
 *   awaiting: { label: string, docId: string }[], docs: Doc[], totalChars: number,
 *   characters: Character[], rel: { nodes: Character[], edges: Edge[], entrances: Record<string,string>[], hasData: boolean },
 *   items: Item[], review: Review|null }} Story
 */
import { parseTables, splitSections, bullets, col, strip, nums } from './md.js';
import { buildIndex, refOrds, refOrd } from './chapters.js';

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
export function parseChapterSpec(text, roleText = '', index = null) {
  const [main = '', ...rest] = text.split('（');
  const sub = rest.join('（');
  const expand = (s) => {
    if (index?.long) return new Set(refOrds(s, index));
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

  /* 章（短編モード：第N章／長編モード：第P部 第N章） */
  const long = isLongForm(files);
  const { chapters, parts } = long ? buildLong(files, pt) : { chapters: buildShort(files, chapterStatusRows), parts: [] };
  const index = buildIndex(chapters, long);
  /** 表の「章」列などの参照（短編：数字、長編：「第P部 第N章」）を、通し番号にする */
  const refs = (s) => (long ? refOrds(s, index) : nums(s));
  const ref1 = (s) => (long ? refOrd(s, index) : nums(s)[0]);

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
      chapters: parseChapterSpec(chapterText, role, index), chapterText,
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
    const ch = ref1(r['章']);
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
    const firsts = refs(col(r, '初登場の章'));
    if (firsts.length) c.first = Math.min(...firsts);
    c.exit = refs(col(r, '退場の章'))[0] ?? null;
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
      track: (track?.rows ?? []).map((x) => ({ ch: ref1(x['章']), owner: strip(col(x, '持ち主')), state: strip(col(x, '状態')), note: strip(x['備考']) })),
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
  const found = (p) => (has(p) ? p : null);
  const stepStatus = (part, key) => part.steps.find((x) => x.label.includes(key))?.status ?? null;
  const common = {
    overview: { id: 'overview', label: '概要・進捗', group: '', path: 'progress.md', status: null },
    state: { id: 'state', label: '物語の現在地', group: '', path: found('story-state.md'), status: null },
    ideas: { id: 'ideas', label: 'アイデア', group: 'フェーズ1', path: found('01_ideas.md'), status: phaseStatus(1) },
    characters: { id: 'characters', label: '登場人物', group: 'フェーズ3', path: found('03_characters.md'), status: phaseStatus(3) },
    relations: { id: 'relations', label: '相関関係図', group: 'フェーズ4', path: found('04_relationships.md'), status: phaseStatus(4) },
    items: { id: 'items', label: '重要な物', group: 'フェーズ5', path: found('05_key-items.md'), status: phaseStatus(5) },
    review: { id: 'review', label: '全体レビュー', group: 'フェーズ8', path: found('08_review.md'), status: phaseStatus(8) },
    manuscript: { id: 'manuscript', label: '完成稿', group: 'フェーズ8', path: found('09_manuscript.md'), status: phaseStatus(8) },
  };
  const plotDoc = (c, group, status) => ({ id: `plot-${c.no}`, label: `${c.label} 起承転結`, group, path: c.plotPath, status });
  const draftDoc = (c, group) => ({ id: `draft-${c.no}`, label: `${c.label}「${c.title}」`, group, path: c.draftPath, status: c.status });
  /** @type {Doc[]} */
  const docs = (long
    ? [
        common.overview,
        ...(has('story-state.md') ? [common.state] : []),
        common.ideas,
        { id: 'outline', label: '部の骨格', group: 'フェーズ2', path: found('02_part-outline.md'), status: phaseStatus(2) },
        ...parts
          .filter((p) => has(`02_chapter-outlines/part${pad(p.no)}.md`))
          .map((p) => ({ id: `partoutline-${p.no}`, label: `第${p.no}部 章構成`, group: 'フェーズ2', path: `02_chapter-outlines/part${pad(p.no)}.md`, status: stepStatus(p, '章構成') })),
        common.characters, common.relations, common.items,
        ...parts.flatMap((p) => chapters.filter((c) => c.part === p.no && c.hasPlot).map((c) => plotDoc(c, `フェーズ6 第${p.no}部`, stepStatus(p, '起承転結') ?? phaseStatus(6)))),
        ...parts.flatMap((p) => chapters.filter((c) => c.part === p.no && c.hasDraft).map((c) => draftDoc(c, `フェーズ7 第${p.no}部`))),
        ...parts
          .filter((p) => has(`08_review/part${pad(p.no)}.md`))
          .map((p) => ({ id: `partreview-${p.no}`, label: `第${p.no}部 中間レビュー`, group: 'フェーズ8', path: `08_review/part${pad(p.no)}.md`, status: stepStatus(p, '中間レビュー') })),
        common.review, common.manuscript,
      ]
    : [
        common.overview, common.ideas,
        { id: 'outline', label: '章構成', group: 'フェーズ2', path: found('02_chapter-outline.md'), status: phaseStatus(2) },
        common.characters, common.relations, common.items,
        ...chapters.filter((c) => c.hasPlot).map((c) => plotDoc(c, 'フェーズ6', phaseStatus(6))),
        ...chapters.filter((c) => c.hasDraft).map((c) => draftDoc(c, 'フェーズ7')),
        common.review, common.manuscript,
      ]
  ).map((d) => ({ ...d, changes: null }));

  /** 部の工程（章構成・起承転結・本文・中間レビュー）の確認待ちを、開くべき成果物に結びつける */
  const stepDocId = (part, label) => {
    if (/章構成|設定/.test(label)) return `partoutline-${part.no}`;
    if (/起承転結/.test(label)) return chapters.find((c) => c.part === part.no && c.hasPlot) ? `plot-${chapters.find((c) => c.part === part.no && c.hasPlot).no}` : 'overview';
    if (/レビュー/.test(label)) return `partreview-${part.no}`;
    return 'overview';
  };
  const awaiting = [
    ...phases.filter((p) => p.status.key === 'review').map((p) => ({ label: `フェーズ${p.no}：${p.name}`, docId: phaseDocId(p.no, chapters) })),
    ...parts.flatMap((p) => p.steps.filter((x) => x.status.key === 'review' && !/本文/.test(x.label)).map((x) => ({ label: `第${p.no}部：${x.label}`, docId: stepDocId(p, x.label) }))),
    ...chapters.filter((c) => c.status.key === 'review').map((c) => ({ label: `${c.label}「${c.title}」の本文`, docId: `draft-${c.no}` })),
  ];

  return {
    name,
    mode: long ? 'long' : 'short',
    input: { first: pick('最初'), last: pick('結末') },
    extras: inputBullets.filter((b) => /^(ジャンル|長さ|読後感|主人公|トーン)/.test(b)),
    policy: bullets(progressMd, '執筆方針'),
    phases, chapters, parts, log,
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

/** 長編モードの物語か（部の骨格、または部ごとのフォルダがあるか） */
export function isLongForm(files) {
  return '02_part-outline.md' in files || Object.keys(files).some((p) => /^(02_chapter-outlines\/part\d+\.md|0[67]_chapter[\w-]*\/part\d+\/)/.test(p));
}

const bodyChars = (draft) => (draft ? (splitSections(draft, 2).find((x) => x.title === '本文')?.body ?? '').replace(/\s/g, '').length : 0);

/** 短編モード：章は「第N章」。ファイルは 06_chapter-plots/chNN.md、07_chapters/chNN.md */
function buildShort(files, statusRows) {
  const outlineRows = parseTables(files['02_chapter-outline.md']).find((t) => t.headers.includes('章') && t.headers.some((h) => h.startsWith('タイトル')))?.rows ?? [];
  const chNos = new Set(outlineRows.map((r) => nums(r['章'])[0]));
  for (const p of Object.keys(files)) {
    const m = p.match(/^0[67]_chapter[\w-]*\/ch(\d+)\.md$/);
    if (m) chNos.add(Number(m[1]));
  }
  return [...chNos].filter(Boolean).sort((a, b) => a - b).map((n) => {
    const o = outlineRows.find((r) => nums(r['章'])[0] === n) ?? {};
    const s = statusRows.find((r) => nums(r['章'])[0] === n);
    const plotPath = `06_chapter-plots/ch${pad(n)}.md`;
    const draftPath = `07_chapters/ch${pad(n)}.md`;
    const draft = files[draftPath];
    return {
      no: n, part: 0, chNo: n, label: `第${n}章`,
      title: strip(s?.['タイトル'] ?? col(o, 'タイトル') ?? ''),
      summary: strip(col(o, '概要')),
      role: strip(col(o, '物語全体での役割') || col(o, '起承転結')).split('：')[0].slice(0, 10),
      status: statusOf(s?.['状態']),
      date: s?.['承認日'] ?? '',
      hasPlot: plotPath in files,
      hasDraft: draft !== undefined,
      chars: bodyChars(draft),
      plotPath, draftPath,
    };
  });
}

/**
 * 長編モード：章は「第P部 第N章」（章番号は部の中で数える）。
 *   02_part-outline.md（部の骨格）、02_chapter-outlines/partPP.md（部ごとの章構成）、
 *   06_chapter-plots/partPP/chNN.md、07_chapters/partPP/chNN.md、
 *   progress.md の「部の進捗」表と「第P部 章ごとの状況」表。
 * 通し番号（no）は、部→章の順に1から振る。
 */
function buildLong(files, pt) {
  const byKey = new Map();
  const touch = (part, chNo) => {
    const k = `${part}-${chNo}`;
    if (!byKey.has(k)) byKey.set(k, { part, chNo, row: {}, status: null });
    return byKey.get(k);
  };
  for (const [path, text] of Object.entries(files)) {
    let m;
    if ((m = path.match(/^02_chapter-outlines\/part(\d+)\.md$/))) {
      const rows = parseTables(text).find((x) => x.headers.includes('章') && x.headers.some((h) => h.startsWith('タイトル')))?.rows ?? [];
      for (const r of rows) {
        const n = nums(r['章'])[0];
        if (n) touch(Number(m[1]), n).row = r;
      }
    } else if ((m = path.match(/^0[67]_chapter[\w-]*\/part(\d+)\/ch(\d+)\.md$/))) touch(Number(m[1]), Number(m[2]));
  }
  for (const tb of pt) {
    if (!(tb.headers.includes('章') && tb.headers.includes('状態') && tb.headers.includes('タイトル'))) continue;
    const part = Number(tb.h3.match(/第(\d+)部/)?.[1]);
    if (!part) continue;
    for (const r of tb.rows) {
      const n = nums(r['章'])[0];
      if (n && byKey.has(`${part}-${n}`)) byKey.get(`${part}-${n}`).status = r;
    }
  }
  const chapters = [...byKey.values()]
    .sort((x, y) => x.part - y.part || x.chNo - y.chNo)
    .map((x, i) => {
      const plotPath = `06_chapter-plots/part${pad(x.part)}/ch${pad(x.chNo)}.md`;
      const draftPath = `07_chapters/part${pad(x.part)}/ch${pad(x.chNo)}.md`;
      const draft = files[draftPath];
      return {
        no: i + 1, part: x.part, chNo: x.chNo, label: `第${x.part}部 第${x.chNo}章`,
        title: strip(x.status?.['タイトル'] ?? col(x.row, 'タイトル') ?? ''),
        summary: strip(col(x.row, '概要')),
        role: strip(col(x.row, '物語全体での役割') || col(x.row, '起承転結')).split('：')[0].slice(0, 10),
        status: statusOf(x.status?.['状態']),
        date: x.status?.['承認日'] ?? '',
        hasPlot: plotPath in files,
        hasDraft: draft !== undefined,
        chars: bodyChars(draft),
        plotPath, draftPath,
      };
    });

  const outlineRows = parseTables(files['02_part-outline.md']).find((x) => x.headers.includes('部') && x.headers.some((h) => h.startsWith('タイトル')))?.rows ?? [];
  const progressRows = pt.find((x) => x.headers.includes('部') && x.headers.includes('本文'))?.rows ?? [];
  const partNos = new Set([...outlineRows, ...progressRows].map((r) => nums(r['部'])[0]).concat(chapters.map((c) => c.part)).filter(Boolean));
  const parts = [...partNos].sort((x, y) => x - y).map((no) => {
    const o = outlineRows.find((r) => nums(r['部'])[0] === no) ?? {};
    const pr = progressRows.find((r) => nums(r['部'])[0] === no);
    const steps = pr ? Object.keys(pr).filter((k) => k !== '部' && !k.startsWith('タイトル')).map((k) => ({ label: k, status: statusOf(pr[k]) })) : [];
    const keys = steps.map((x) => x.status.key);
    const status = !keys.length ? statusOf('') : keys.every((k) => k === 'approved') ? statusOf('承認済み') : keys.includes('review') ? statusOf('レビュー待ち') : keys.some((k) => k !== 'todo') ? statusOf('作成中') : statusOf('');
    const mine = chapters.filter((c) => c.part === no);
    return {
      no,
      title: strip(pr?.['タイトル'] || col(o, 'タイトル') || ''),
      summary: strip(col(o, '概要')),
      role: strip(col(o, '物語全体での役割') || col(o, '役割')).split('：')[0].slice(0, 10),
      steps, status,
      chapters: mine.map((c) => c.no),
      chars: mine.reduce((sum, c) => sum + c.chars, 0),
    };
  });
  return { chapters, parts };
}
