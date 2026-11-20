/** 物語ビューア：stories/ を読み取り専用で配信するローカルサーバー。ファイルは一切書き換えない。 */
import http from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { exec } from 'node:child_process';
import { dirname, join, resolve, sep, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStory } from './lib/story.js';
import { gitState, fileDiff } from './lib/git.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argVal = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const STORIES_DIR = resolve(argVal('stories') ?? process.env.STORIES_DIR ?? join(ROOT, '..', 'stories'));
const START_PORT = Number(argVal('port') ?? process.env.PORT ?? 8765);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const STATIC = {
  '/vendor/marked.js': join(ROOT, 'node_modules/marked/lib/marked.umd.js'),
  '/vendor/cytoscape.js': join(ROOT, 'node_modules/cytoscape/dist/cytoscape.min.js'),
  '/shared/relations.js': join(ROOT, 'lib/relations.js'),
  '/shared/md.js': join(ROOT, 'lib/md.js'),
  '/shared/chapters.js': join(ROOT, 'lib/chapters.js'),
  '/shared/layout.js': join(ROOT, 'lib/layout.js'),
};

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

/** 物語名は stories/ 直下のフォルダ名のみ許可する */
async function storyDir(name) {
  if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) return null;
  const dir = join(STORIES_DIR, name);
  try {
    return (await stat(join(dir, 'progress.md'))).isFile() ? dir : null;
  } catch {
    return null;
  }
}

async function listStoryNames() {
  const entries = await readdir(STORIES_DIR, { withFileTypes: true }).catch(() => []);
  const names = [];
  for (const e of entries) if (e.isDirectory() && (await storyDir(e.name))) names.push(e.name);
  return names.sort((a, b) => a.localeCompare(b, 'ja'));
}

async function readMarkdownFiles(dir) {
  const files = {};
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.md')) files[relative(dir, p).split(sep).join('/')] = await readFile(p, 'utf8');
    }
  };
  await walk(dir);
  return files;
}

async function buildModel(name) {
  const dir = await storyDir(name);
  if (!dir) return null;
  const [files, git] = await Promise.all([readMarkdownFiles(dir), gitState(dir)]);
  const story = loadStory(name, files);
  for (const d of story.docs) d.changes = d.path ? git.dirty.get(d.path) ?? null : null;
  const dirtyPaths = [...git.dirty.keys()].filter((p) => p.endsWith('.md'));
  return { ...story, git: { available: git.available, history: git.history, dirty: dirtyPaths.map((p) => ({ path: p, state: git.dirty.get(p) })) } };
}

async function summary(name) {
  const m = await buildModel(name);
  return {
    name, pct: m.progress.pct, approved: m.progress.approved, total: m.progress.total, current: m.progress.current,
    awaiting: m.awaiting, changed: m.git.dirty.length, chapters: m.chapters.length, parts: m.parts.length, totalChars: m.totalChars,
    first: m.input.first, last: m.input.last, lastCommit: m.git.history[0] ?? null,
  };
}

/* ファイル変更 → 画面へ通知（SSE） */
const clients = new Set();
let timer = null;
const pending = new Set();
function broadcast() {
  const data = JSON.stringify({ stories: [...pending] });
  pending.clear();
  for (const c of clients) c.write(`event: change\ndata: ${data}\n\n`);
}
try {
  watch(STORIES_DIR, { recursive: true }, (_, filename) => {
    if (!filename) return;
    const parts = filename.split(/[\\/]/);
    if (parts.includes('.git') && !parts.some((p) => p === 'index' || p === 'HEAD' || p === 'refs')) return;
    pending.add(parts[0]);
    clearTimeout(timer);
    timer = setTimeout(broadcast, 300);
  });
} catch (e) {
  console.warn('ファイル監視を開始できませんでした（自動更新なし）:', e.message);
}
setInterval(() => clients.forEach((c) => c.write(': ping\n\n')), 25000).unref();

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);

  if (path === '/api/stories') {
    const names = await listStoryNames();
    return json(res, 200, await Promise.all(names.map(summary)));
  }
  let m;
  if ((m = path.match(/^\/api\/stories\/([^/]+)$/))) {
    const model = await buildModel(m[1]);
    return model ? json(res, 200, model) : json(res, 404, { error: 'story not found' });
  }
  if ((m = path.match(/^\/api\/stories\/([^/]+)\/file$/))) {
    const dir = await storyDir(m[1]);
    const rel = url.searchParams.get('path') ?? '';
    const abs = dir && resolve(dir, rel);
    if (!dir || !rel.endsWith('.md') || !abs.startsWith(dir + sep)) return json(res, 404, { error: 'not found' });
    const text = await readFile(abs, 'utf8').catch(() => null);
    if (text === null) return json(res, 404, { error: 'not found' });
    const git = await gitState(dir);
    const changes = git.dirty.get(rel.replace(/\\/g, '/')) ?? null;
    return json(res, 200, { path: rel, text, changes, diff: changes === 'modified' ? await fileDiff(dir, rel) : null });
  }
  if (path === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const file = STATIC[path] ?? (path === '/' ? join(ROOT, 'public/index.html') : join(ROOT, 'public', path));
  const abs = resolve(file);
  const allowed = Object.values(STATIC).includes(abs) || abs.startsWith(join(ROOT, 'public') + sep);
  if (!allowed) return json(res, 404, { error: 'not found' });
  try {
    const body = await readFile(abs);
    res.writeHead(200, { 'content-type': MIME[extname(abs)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    json(res, 404, { error: 'not found' });
  }
}

const server = http.createServer((req, res) => {
  const host = (req.headers.host ?? '').split(':')[0];
  if (host !== 'localhost' && host !== '127.0.0.1') return json(res, 403, { error: 'forbidden' });
  handle(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: String(e.message ?? e) });
  });
});

function listen(port) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && port < START_PORT + 10) listen(port + 1);
    else throw e;
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/`;
    console.log(`物語ビューア: ${url}\n読み取り元: ${STORIES_DIR}\n終了するには Ctrl+C`);
    if (!args.includes('--no-open')) exec(`start "" "${url}"`);
  });
}
listen(START_PORT);
