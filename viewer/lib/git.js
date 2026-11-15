/**
 * 物語リポジトリの「承認済みの状態（HEAD）」と作業ツリーの差。
 * story-creator は承認された状態だけをコミットするので、差分 = 前回承認からの未承認の変更になる。
 *
 * @typedef {{ available: boolean, history: { hash: string, date: string, subject: string }[], dirty: Map<string, 'modified'|'new'|'deleted'> }} GitState
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, sep } from 'node:path';

const run = promisify(execFile);
const BASE = ['-c', 'core.quotepath=false', '-c', 'i18n.logOutputEncoding=utf-8'];

async function git(dir, args, ok = [0]) {
  try {
    const { stdout } = await run('git', [...BASE, '-C', dir, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
    return stdout;
  } catch (e) {
    if (ok.includes(e.code)) return e.stdout ?? '';
    throw e;
  }
}

/** dir 自身がリポジトリの最上位のときだけ true。親リポジトリ（ワークスペース）を誤って読まない */
export async function isOwnRepo(dir) {
  try {
    const top = (await git(dir, ['rev-parse', '--show-toplevel'])).trim();
    return resolve(top).toLowerCase() === resolve(dir).toLowerCase().replace(new RegExp(`\\${sep}$`), '');
  } catch {
    return false;
  }
}

const EMPTY = { available: false, history: [], dirty: new Map() };

/** @returns {Promise<GitState>} */
export async function gitState(dir) {
  if (!(await isOwnRepo(dir))) return { ...EMPTY, dirty: new Map() };
  const [log, status] = await Promise.all([
    git(dir, ['log', '-40', '--format=%h%x09%ad%x09%s', '--date=short']).catch(() => ''),
    git(dir, ['status', '--porcelain=v1', '-z', '-uall']).catch(() => ''),
  ]);
  const history = log.split('\n').filter(Boolean).map((l) => {
    const [hash, date, ...rest] = l.split('\t');
    return { hash, date, subject: rest.join('\t') };
  });
  const dirty = new Map();
  for (const entry of status.split('\0').filter(Boolean)) {
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    dirty.set(path, xy === '??' || xy.includes('A') ? 'new' : xy.includes('D') ? 'deleted' : 'modified');
  }
  return { available: true, history, dirty };
}

/** HEAD との unified diff。追跡されていない新規ファイルや、リポジトリでない場合は null */
export async function fileDiff(dir, relPath) {
  if (!(await isOwnRepo(dir))) return null;
  const out = await git(dir, ['diff', 'HEAD', '--no-color', '--unified=2', '--', relPath], [0, 1]);
  return out.trim() ? out : null;
}
