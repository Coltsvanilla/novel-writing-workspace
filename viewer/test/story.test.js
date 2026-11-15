import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStory, parseChapterSpec } from '../lib/story.js';
import { edgeAt, nodeAt } from '../lib/relations.js';
import { isOwnRepo } from '../lib/git.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = join(HERE, '..', '..', 'stories', '馬車から始まる希望');
const FIXTURE = join(HERE, 'fixtures', '星降る図書館');

function readFiles(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) out[relative(dir, p).split(sep).join('/')] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

test('章の登場表記を、本編と言及に分ける', () => {
  assert.deepEqual(parseChapterSpec('第1〜5章（第6章は回想）'), { main: [1, 2, 3, 4, 5], mention: [6] });
  assert.deepEqual(parseChapterSpec('第5章（第1・4・6章で言及）'), { main: [5], mention: [1, 4, 6] });
  assert.deepEqual(parseChapterSpec('第1章・第6章（言及）'), { main: [], mention: [1, 6] });
  assert.deepEqual(parseChapterSpec('第4章（第5章で言及）', '言及のみ'), { main: [], mention: [4, 5] });
});

test('承認前の物語：確認待ちと進捗が読める', () => {
  const s = loadStory('星降る図書館', readFiles(FIXTURE));
  assert.equal(s.progress.approved, 3);
  assert.equal(s.progress.total, 8);
  assert.equal(s.progress.current.no, 4);
  assert.deepEqual(s.awaiting, [{ label: 'フェーズ4：相関関係図', docId: 'relations' }]);
  assert.equal(s.chapters.length, 5);
  assert.equal(s.review, null);
  assert.equal(s.docs.find((d) => d.id === 'items').path, null);
});

test('承認前の物語：開始時点の表にない人物は、初登場の章から相関図に出る', () => {
  const s = loadStory('星降る図書館', readFiles(FIXTURE));
  const toto = s.rel.nodes.find((n) => n.display === 'トト');
  assert.equal(nodeAt(toto, 0).visible, false);
  assert.equal(nodeAt(toto, 2).visible, true);
  const mio = s.rel.nodes.find((n) => n.display === 'ミオ');
  const edge = s.rel.edges.find((e) => e.a === mio.id && e.b === toto.id);
  assert.equal(edgeAt(edge, 1).visible, false);
  assert.equal(edgeAt(edge, 2).label, '頼れる夜の相棒');
});

test('実物の物語：全フェーズ承認済みで、人物・関係・物・レビューが読める', { skip: !existsSync(join(REAL, 'progress.md')) }, () => {
  const s = loadStory('馬車から始まる希望', readFiles(REAL));
  assert.equal(s.progress.pct, 100);
  assert.equal(s.awaiting.length, 0);
  assert.equal(s.chapters.length, 6);
  assert.ok(s.totalChars > 15000);
  assert.equal(s.characters.length, 11);
  assert.equal(s.rel.nodes.length, 11, '愛称の表記ゆれ（ダン／ダニエル）で人物が二重にならない');
  assert.equal(s.items.length, 5);
  assert.deepEqual(s.chapters.map((c) => c.role.slice(0, 1)), ['起', '承', '承', '転', '転', '結']);
  assert.ok(s.chapters.every((c) => c.summary && c.role.length <= 10), '章構成表の列名の注記（概要（2〜4行）など）に依らず概要と役割を読む');
  assert.equal(s.review.findings.length, 9);
  assert.ok(s.input.first.includes('馬車'));

  const names = Object.fromEntries(s.characters.map((c) => [c.display, c]));
  assert.equal(names['ユルゲン'].extra.length, 2, '苗字の一致で別人の追加情報を拾わない');
  assert.equal(names['ガスパル'].kind, 'support', '「乗合馬車」の語で動物扱いにならない');
  assert.equal(names['マロン'].kind, 'animal');
  assert.ok(names['アルノ'].voice, '台詞の方針の表が人物に結びつく');

  const arno = names['アルノ'], rina = names['リナ'];
  const ar = s.rel.edges.find((e) => [e.a, e.b].sort().join() === [arno.id, rina.id].sort().join());
  assert.equal(ar.timeline.length, 6);
  assert.equal(edgeAt(ar, 0).label, '乗客と見習い御者');
  assert.equal(edgeAt(ar, 3).label, '互いに頼り合う仲間');
  assert.ok(edgeAt(ar, 3).changedNow);
  assert.equal(edgeAt(ar, 6).label, '来年の再会を楽しみにする相手');

  const hans = s.rel.edges.find((e) => e.since === 2 && e.timeline.some((t) => t.after.includes('感謝')));
  assert.equal(edgeAt(hans, 1).visible, false);
  assert.equal(edgeAt(hans, 2).visible, true);
});

test('物語フォルダが自前のリポジトリでなければ、差分は出さない', async () => {
  assert.equal(await isOwnRepo(FIXTURE), false);
});

import { radialLayout } from '../lib/layout.js';

const box = { width: 760, height: 560 };
const minGap = (pos) => {
  const p = Object.values(pos);
  let m = Infinity;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) m = Math.min(m, Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y));
  return m;
};

test('放射状レイアウト：中心に主人公、全員が箱の中、決定的', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const links = [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'e'], ['b', 'f']];
  const pos = radialLayout({ ids, links, rootId: 'a', ...box });
  assert.deepEqual(pos.a, { x: 380, y: 280 });
  for (const p of Object.values(pos)) assert.ok(p.x >= 0 && p.x <= box.width && p.y >= 0 && p.y <= box.height);
  assert.deepEqual(radialLayout({ ids, links, rootId: 'a', ...box }), pos);
  assert.ok(minGap(pos) > 70, '人物が重ならない');
});

test('放射状レイアウト：つながりのない人物・1人・空も扱える', () => {
  const lone = radialLayout({ ids: ['a', 'b', 'z'], links: [['a', 'b']], rootId: 'a', ...box });
  assert.equal(Object.keys(lone).length, 3);
  assert.deepEqual(radialLayout({ ids: ['a'], links: [], ...box }), { a: { x: 380, y: 280 } });
  assert.deepEqual(radialLayout({ ids: [], links: [], ...box }), {});
});

test('実物の相関図：どの章の時点でも、人物が重ならない配置になる', { skip: !existsSync(join(REAL, 'progress.md')) }, () => {
  const s = loadStory('馬車から始まる希望', readFiles(REAL));
  const root = s.rel.nodes.find((n) => n.kind === 'protagonist').id;
  for (let ch = 0; ch <= 6; ch++) {
    const ids = s.rel.nodes.filter((n) => nodeAt(n, ch).visible).map((n) => n.id);
    const links = s.rel.edges.filter((e) => edgeAt(e, ch).visible && ids.includes(e.a) && ids.includes(e.b)).map((e) => [e.a, e.b]);
    const pos = radialLayout({ ids, links, rootId: root, ...box });
    assert.equal(Object.keys(pos).length, ids.length);
    assert.ok(minGap(pos) > 60, `第${ch}章の時点で最小間隔 ${minGap(pos).toFixed(0)}px`);
  }
});
