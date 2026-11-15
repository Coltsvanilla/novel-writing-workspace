/** story-creator のテンプレートが使う Markdown の形（見出し・表・箇条書き）を読む低レベル部品 */

export const strip = (s) => (s ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim();
export const nums = (s) => (String(s).match(/\d+/g) ?? []).map(Number);

/** 「。」「（」までを取り出し、長ければ省略する */
export function short(s, n = 16) {
  const t = strip(s).split(/[（。]/)[0];
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

const splitRow = (line) => {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  return l.split('|').map((c) => c.trim());
};

/**
 * @typedef {{ h2: string, h3: string, headers: string[], rows: Record<string,string>[] }} Table
 */

/** 文書中の表をすべて、直前の ## / ### 見出しつきで返す。コードブロック内は読まない */
export function parseTables(md) {
  const lines = (md ?? '').split(/\r?\n/);
  /** @type {Table[]} */
  const out = [];
  let h2 = '', h3 = '', inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    let m;
    if ((m = l.match(/^## (.*)/))) { h2 = m[1].trim(); h3 = ''; continue; }
    if ((m = l.match(/^### (.*)/))) { h3 = m[1].trim(); continue; }
    if (l.startsWith('|') && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? '')) {
      const headers = splitRow(l);
      const rows = [];
      i += 2;
      for (; i < lines.length && lines[i].startsWith('|'); i++) {
        const cells = splitRow(lines[i]);
        rows.push(Object.fromEntries(headers.map((h, k) => [h, cells[k] ?? ''])));
      }
      i--;
      out.push({ h2, h3, headers, rows });
    }
  }
  return out;
}

/** 指定レベルの見出しで本文を区切る。見出し前の部分は title が空の節になる */
export function splitSections(md, level) {
  const re = new RegExp(`^${'#'.repeat(level)} (.*)`);
  const out = [{ title: '', body: [] }];
  let inCode = false;
  for (const l of (md ?? '').split(/\r?\n/)) {
    if (l.startsWith('```')) inCode = !inCode;
    const m = !inCode && l.match(re);
    if (m) out.push({ title: m[1].trim(), body: [] });
    else out.at(-1).body.push(l);
  }
  return out.map((s) => ({ title: s.title, body: s.body.join('\n').trim() }));
}

/** 見出しが prefix で始まる節の本文から、「- 」の箇条書きを取り出す */
export function bullets(md, titlePrefix) {
  const sec = splitSections(md, 2).find((s) => s.title.startsWith(titlePrefix));
  return (sec?.body.match(/^\s*- .*/gm) ?? []).map((l) => strip(l.replace(/^\s*- /, '')));
}

/** 列名が prefix で始まる最初のセルを返す（列名の末尾の注記ゆれに強くする） */
export function col(row, prefix) {
  const k = Object.keys(row).find((key) => key.startsWith(prefix));
  return k ? row[k] : '';
}
