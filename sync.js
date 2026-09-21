// 旅箋 TABISEN — 同期。自分の GitHub の非公開リポジトリに data.json を置き、端末どうしの付箋を合わせる。
// 通信先は api.github.com だけ。トークンはこの端末のブラウザの中（localStorage）にだけ置く。
import { mergeStates, sameState, parseImport } from './logic.js';

const CFG_KEY = 'tabisen.sync';
const API = 'https://api.github.com';
const FILE = 'data.json';

const toBase64 = s => { const bytes = new TextEncoder().encode(s); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };
const fromBase64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
const toUrl = s => toBase64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrl = s => fromBase64(s.replace(/-/g, '+').replace(/_/g, '/'));

export const TOKEN_RE = /^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/;
export const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export function loadConfig() {
  try { const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); return c && REPO_RE.test(c.repo) && c.token ? c : null; } catch (e) { return null; }
}
const saveConfig = c => localStorage.setItem(CFG_KEY, JSON.stringify(c));

// 別の端末から「つなぐリンク」で開かれたときの設定を取り出す（URL からはすぐ消す）
export function takeLinkConfig() {
  const m = /^#sync=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  try { const c = JSON.parse(fromUrl(m[1])); return REPO_RE.test(c.repo) && TOKEN_RE.test(c.token) ? { repo: c.repo, token: c.token } : null; } catch (e) { return null; }
}

function httpError(res) {
  const map = {
    401: 'トークンが認識されません。貼り間違いか、期限切れです',
    403: '権限が足りないか、GitHub の利用制限にかかりました。トークンの Contents が Read and write か確認してください',
    404: 'リポジトリが見つかりません。名前と、トークンの対象リポジトリを確認してください',
  };
  const e = new Error(map[res.status] || `GitHub から ${res.status} が返りました`);
  e.status = res.status;
  return e;
}

export function createSync({ getState, applyState, onStatus }) {
  let cfg = loadConfig();
  let timer = null, inflight = false, again = false, interval = null;
  let status = { state: cfg ? 'idle' : 'off', at: cfg ? cfg.lastSyncAt || 0 : 0, message: '' };
  const emit = patch => { status = { ...status, ...patch }; onStatus(status); };
  const headers = () => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28' });
  const fileUrl = () => `${API}/repos/${cfg.repo}/contents/${FILE}`;

  async function pull() {
    const res = await fetch(`${fileUrl()}?t=${Date.now()}`, { headers: headers(), cache: 'no-store' });
    if (res.status === 404) return { remote: null, sha: null };
    if (!res.ok) throw httpError(res);
    const j = await res.json();
    let remote = null;
    try { const parsed = JSON.parse(fromBase64(j.content)); remote = parseImport(JSON.stringify(parsed.state || parsed)); } catch (e) { remote = null; }
    return { remote, sha: j.sha };
  }
  async function push(state, sha) {
    const body = { message: `旅箋 ${new Date().toISOString()}`, content: toBase64(JSON.stringify({ version: 1, savedAt: Date.now(), state })) };
    if (sha) body.sha = sha;
    const res = await fetch(fileUrl(), { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw httpError(res);
  }

  async function sync() {
    if (!cfg) return;
    if (inflight) { again = true; return; }
    inflight = true; emit({ state: 'syncing', message: '' });
    try {
      const { remote, sha } = await pull();
      const local = getState();
      const merged = remote ? mergeStates(local, remote) : local;
      const changedHere = !sameState(merged, local);
      if (changedHere) applyState(merged);
      if (!remote || !sameState(merged, remote)) {
        try { await push(merged, sha); }
        catch (e) { if (e.status === 409 || e.status === 422) again = true; else throw e; }   // 同時更新: もう一度取り込んでから送る
      }
      cfg.lastSyncAt = Date.now(); saveConfig(cfg);
      emit({ state: 'ok', at: cfg.lastSyncAt, message: '', pulled: changedHere });
    } catch (e) {
      const offline = navigator.onLine === false || e instanceof TypeError;
      emit({ state: offline ? 'offline' : 'error', message: offline ? 'つながりませんでした。次に開いたときに同期します' : e.message });
    } finally {
      inflight = false;
      if (again) { again = false; setTimeout(sync, 800); }
    }
  }

  async function connect(next) {
    const repo = String(next.repo || '').trim(), token = String(next.token || '').trim();
    if (!REPO_RE.test(repo)) throw new Error('リポジトリは「ユーザー名/リポジトリ名」の形で入れてください');
    if (!TOKEN_RE.test(token)) throw new Error('トークンの形が違います。github_pat_ で始まる文字列を貼ってください');
    const res = await fetch(`${API}/repos/${repo}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }, cache: 'no-store' });
    if (!res.ok) throw httpError(res);
    const j = await res.json();
    if (!j.private) throw new Error('このリポジトリは公開されています。非公開のリポジトリを使ってください');
    if (j.permissions && j.permissions.push === false) throw new Error('書き込みできません。トークンの Contents を Read and write にしてください');
    cfg = { repo, token, lastSyncAt: 0 }; saveConfig(cfg);
    emit({ state: 'idle', at: 0, message: '' });
    start();
    await sync();
  }
  function disconnect() {
    localStorage.removeItem(CFG_KEY); cfg = null; stop();
    emit({ state: 'off', at: 0, message: '' });
  }
  function schedule() { if (!cfg) return; clearTimeout(timer); timer = setTimeout(sync, 2000); }
  function start() {
    if (!cfg || interval) return;
    interval = setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 5 * 60 * 1000);
    sync();
  }
  function stop() { clearInterval(interval); interval = null; clearTimeout(timer); }
  document.addEventListener('visibilitychange', () => { if (cfg && document.visibilityState === 'visible') sync(); });
  window.addEventListener('online', () => { if (cfg) sync(); });
  const link = () => (cfg ? `${location.origin}${location.pathname}#sync=${toUrl(JSON.stringify({ repo: cfg.repo, token: cfg.token }))}` : '');
  return { connect, disconnect, sync, schedule, start, link, get config() { return cfg; }, get status() { return status; } };
}
