import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const [url, out] = argv;
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const flag = (k) => argv.includes(`--${k}`);
const W = Number(opt('w', 1440)), H = Number(opt('h', 1000));
const wait = Number(opt('wait', 1800));

const port = 9300 + Math.floor(Math.random() * 500);

const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--window-size=${W},${H}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'edge-'))}`, '--no-first-run', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch {}
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text));
  else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) errors.push(`console.${d.params.type} ` + d.params.args.map((a) => a.value ?? a.description).join(' '));
  else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push('LOG ' + d.params.entry.text + ' ' + (d.params.entry.url ?? ''));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
const metrics = (h) => send('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 1, mobile: false });
await metrics(H);
if (flag('dark')) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
const origin = new URL(url).origin;
const ls = argv.flatMap((a, i) => (a === '--ls' ? [argv[i + 1]] : []));
if (ls.length) {
  await send('Page.navigate', { url: origin + '/style.css' });
  await sleep(500);
  for (const kv of ls) { const [k, v] = kv.split('='); await evalJS(`localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})`); }
}
await send('Page.navigate', { url });
await sleep(wait);
const steps = argv.flatMap((a, i) => (['--eval','--exec','--wait2'].includes(a) ? [[a, argv[i + 1]]] : []));
for (const [k, v0] of steps) { if (k === '--eval') { const v = await evalJS(v0); if (v !== undefined) console.log('eval =>', JSON.stringify(v)); await sleep(700); } else if (k === '--exec') execSync(v0, { stdio: 'inherit' }); else await sleep(Number(v0)); }
if (flag('full')) {
  const sh = await evalJS('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
  await metrics(Math.min(Math.max(sh, H), Number(opt('maxh', 3600))));
  await sleep(600);
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
mkdirSync(join(out, '..'), { recursive: true });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out, 'errors:', errors.length ? errors : 'none');
ws.close(); edge.kill();
process.exit(0);
