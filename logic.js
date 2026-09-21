// 旅箋 TABISEN — 計算部分。画面に触らない純粋関数だけを置く（test/ で検証）。

const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export const DAYS_LABEL = { '': '', day: '日帰り', '1': '1泊', '2': '2泊', '3plus': '3泊〜' };
export const COLORS = ['yellow', 'pink', 'mint', 'sky', 'lavender'];

// ---- 祝日 ----
function nthMonday(y, m, n) { const first = new Date(y, m - 1, 1).getDay(); return 1 + ((8 - first) % 7) + (n - 1) * 7; }
function equinox(y, base) { return Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }

export function jpHolidays(year) {
  const h = new Map();
  const set = (m, d, name) => h.set(`${year}-${pad(m)}-${pad(d)}`, name);
  set(1, 1, '元日'); set(1, nthMonday(year, 1, 2), '成人の日'); set(2, 11, '建国記念の日'); set(2, 23, '天皇誕生日');
  set(3, equinox(year, 20.8431), '春分の日'); set(4, 29, '昭和の日');
  set(5, 3, '憲法記念日'); set(5, 4, 'みどりの日'); set(5, 5, 'こどもの日');
  set(7, nthMonday(year, 7, 3), '海の日'); set(8, 11, '山の日');
  set(9, nthMonday(year, 9, 3), '敬老の日'); set(9, equinox(year, 23.2488), '秋分の日');
  set(10, nthMonday(year, 10, 2), 'スポーツの日'); set(11, 3, '文化の日'); set(11, 23, '勤労感謝の日');
  for (const key of [...h.keys()]) {            // 振替休日: 日曜の祝日は次の平日へ
    const d = parseYmd(key);
    if (d.getDay() !== 0) continue;
    let x = addDays(d, 1);
    while (h.has(ymd(x))) x = addDays(x, 1);
    h.set(ymd(x), '振替休日');
  }
  for (let m = 0; m < 12; m++) for (let day = 1; day <= 31; day++) {   // 国民の休日: 祝日に挟まれた平日
    const x = new Date(year, m, day);
    if (x.getMonth() !== m) continue;
    const k = ymd(x);
    if (h.has(k) || x.getDay() === 0) continue;
    if (h.has(ymd(addDays(x, -1))) && h.has(ymd(addDays(x, 1)))) h.set(k, '国民の休日');
  }
  return h;
}

function holidayLookup() {
  const cache = new Map();
  return s => { const y = Number(s.slice(0, 4)); if (!cache.has(y)) cache.set(y, jpHolidays(y)); return cache.get(y).get(s); };
}
export function isOffDay(d, hol) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  const m = d.getMonth() + 1, day = d.getDate();
  if ((m === 12 && day >= 29) || (m === 1 && day <= 3)) return true;   // 年末年始（一般的な休み）
  return !!hol(ymd(d));
}

// 今日以降の「3日以上の連休」を列挙する。今日を含む連休は最初から入れる。
export function holidayWindows(today, months = 12, minDays = 3) {
  const hol = holidayLookup();
  const todayKey = ymd(today);
  let d = addDays(today, -14);
  const end = addDays(today, Math.round(months * 30.5));
  const runs = []; let run = null;
  while (d <= end) {
    if (isOffDay(d, hol)) { if (!run) run = { days: [] }; run.days.push(new Date(d)); }
    else if (run) { runs.push(run); run = null; }
    d = addDays(d, 1);
  }
  if (run) runs.push(run);
  return runs
    .filter(r => r.days.length >= minDays && ymd(r.days.at(-1)) >= todayKey)
    .map(r => {
      const names = [];
      for (const x of r.days) { const n = hol(ymd(x)); if (n && n !== '振替休日' && n !== '国民の休日' && !names.includes(n)) names.push(n); }
      const has = (m, day) => r.days.some(x => x.getMonth() === m - 1 && x.getDate() === day);
      const tag = has(12, 31) ? '年末年始' : has(5, 3) ? 'ゴールデンウィーク' : null;
      const start = ymd(r.days[0]);
      return { id: `auto:${start}`, kind: 'auto', start, end: ymd(r.days.at(-1)), days: r.days.length, names, tag };
    });
}

// ---- 表示用の文字列 ----
// 数字を主役にした日付: 9/19–23 / 12/29–1/3 / 11/3
export function formatRange(start, end) {
  const a = parseYmd(start), b = parseYmd(end);
  if (start === end) return `${a.getMonth() + 1}/${a.getDate()}`;
  const bTxt = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${b.getMonth() + 1}/${b.getDate()}`;
  return `${a.getMonth() + 1}/${a.getDate()}–${bTxt}`;
}
// 曜日の範囲: 土〜水 / 火
export function dowRange(start, end) {
  const a = DOW[parseYmd(start).getDay()], b = DOW[parseYmd(end).getDay()];
  return start === end ? a : `${a}〜${b}`;
}
// 列の見出し: eyebrow（小さな前置き）/ title（大きな数字）/ sub（祝日名や名前）
export function laneTitle(lane, today) {
  const year = today && lane.start && lane.start.slice(0, 4) !== ymd(today).slice(0, 4) ? [lane.start.slice(0, 4)] : [];
  if (lane.kind === 'custom') {
    if (!lane.start) return { eyebrow: '日程は未定', title: lane.label, sub: '' };
    const n = Math.round((parseYmd(lane.end) - parseYmd(lane.start)) / 86400000) + 1;
    return { eyebrow: [...year, dowRange(lane.start, lane.end), `${n}日間`].join('・'), title: formatRange(lane.start, lane.end), sub: lane.label || '自分で選んだ日程' };
  }
  return { eyebrow: [...year, dowRange(lane.start, lane.end), `${lane.days}連休`].join('・'), title: formatRange(lane.start, lane.end), sub: lane.tag || lane.names.join('・') };
}


// ---- 状態 ----
export const emptyState = () => ({ version: 1, notes: [], customLanes: [], hiddenLanes: [], hiddenLanesAt: 0, deleted: [] });
const now = () => Date.now();
let seq = 0;
const uid = p => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const randomRot = () => Math.round((Math.random() * 3 - 1.5) * 2) / 2;

function normalizeNote(n) {
  return {
    id: String(n.id || uid('n')),
    text: String(n.text || '').trim().slice(0, 60),
    memo: String(n.memo || '').trim().slice(0, 300),
    color: COLORS.includes(n.color) ? n.color : 'yellow',
    stars: [0, 1, 2, 3].includes(n.stars) ? n.stars : 0,
    days: Object.hasOwn(DAYS_LABEL, n.days || '') ? (n.days || '') : '',
    laneId: n.laneId ? String(n.laneId) : null,
    rot: typeof n.rot === 'number' && n.rot >= -2 && n.rot <= 2 ? n.rot : randomRot(),
    createdAt: n.createdAt || now(),
    updatedAt: n.updatedAt || n.createdAt || now(),
  };
}
const touch = n => ({ ...n, updatedAt: now() });
// 消した記録（別の端末に「これは消した」と伝えるため）。半年より古いものは捨てる
const remember = (deleted, id) => [...deleted.filter(d => d.id !== id && d.at > now() - 180 * 86400000), { id, at: now() }];

export function buildLanes(state, today) {
  const todayKey = ymd(today);
  const hidden = new Set(state.hiddenLanes);
  const auto = holidayWindows(today).filter(w => !hidden.has(w.id));
  const custom = state.customLanes.map(c => ({ ...c, kind: 'custom' }));
  const dated = [...auto, ...custom.filter(c => c.start)].sort((a, b) => a.start.localeCompare(b.start));
  const undated = custom.filter(c => !c.start);
  return [...dated, ...undated];
}

export function addNote(state, fields) {
  const note = normalizeNote({ ...fields, id: undefined });
  if (!note.text) return state;
  return { ...state, notes: [...state.notes, note] };
}
export function updateNote(state, id, fields) {
  return { ...state, notes: state.notes.map(n => (n.id === id ? touch(normalizeNote({ ...n, ...fields, id })) : n)) };
}
export function deleteNote(state, id) {
  if (!state.notes.some(n => n.id === id)) return state;
  return { ...state, notes: state.notes.filter(n => n.id !== id), deleted: remember(state.deleted, id) };
}
export function moveNote(state, id, laneId) {
  return { ...state, notes: state.notes.map(n => (n.id === id && n.laneId !== (laneId || null) ? touch({ ...n, laneId: laneId || null }) : n)) };
}
function releaseLane(state, laneId) {
  return state.notes.map(n => (n.laneId === laneId ? touch({ ...n, laneId: null }) : n));
}
export function hideLane(state, laneId) {
  if (state.hiddenLanes.includes(laneId)) return state;
  return { ...state, hiddenLanes: [...state.hiddenLanes, laneId], hiddenLanesAt: now(), notes: releaseLane(state, laneId) };
}
export function unhideAll(state) { return { ...state, hiddenLanes: [], hiddenLanesAt: now() }; }
// 名前か日付のどちらかがあれば足せる。名前が空なら日付がそのまま名前になる。
export function addCustomLane(state, { label, start, end }) {
  const l = String(label || '').trim().slice(0, 40);
  let s = start || '', e = end || '';
  if (s && !e) e = s;
  if (e && !s) s = e;
  if (s && e && e < s) [s, e] = [e, s];
  if (!l && !s) return state;
  const lane = { id: uid('custom:'), label: l, start: s, end: e, updatedAt: now() };
  return { ...state, customLanes: [...state.customLanes, lane] };
}
// 同じ日程の（名前なしの）休みが既にあればそれを返す
export function findDateLane(state, start, end) {
  const e = end || start;
  return state.customLanes.find(c => !c.label && c.start === start && c.end === e) || null;
}
export function removeCustomLane(state, laneId) {
  if (!state.customLanes.some(c => c.id === laneId)) return state;
  return { ...state, customLanes: state.customLanes.filter(c => c.id !== laneId), notes: releaseLane(state, laneId), deleted: remember(state.deleted, laneId) };
}
// 無くなった列（過ぎた連休・隠した連休）に貼ってあった付箋は Ideas へ戻す。
export function expire(state, lanes) {
  const live = new Set(lanes.map(l => l.id));
  if (state.notes.every(n => !n.laneId || live.has(n.laneId))) return state;
  return { ...state, notes: state.notes.map(n => (!n.laneId || live.has(n.laneId) ? n : touch({ ...n, laneId: null }))) };
}

// ---- 同期の合流: 2つの端末の状態をひとつにする（順番を入れ替えても同じ結果になる） ----
export function mergeStates(a, b) {
  const delMap = new Map();
  for (const d of [...(a.deleted || []), ...(b.deleted || [])]) if (!delMap.has(d.id) || delMap.get(d.id) < d.at) delMap.set(d.id, d.at);
  const alive = x => !(delMap.has(x.id) && delMap.get(x.id) >= (x.updatedAt || 0));
  const pick = (xa, xb) => ((xb.updatedAt || 0) > (xa.updatedAt || 0) ? xb : xa);
  const mergeList = (la, lb) => {
    const m = new Map();
    for (const x of la) m.set(x.id, x);
    for (const x of lb) m.set(x.id, m.has(x.id) ? pick(m.get(x.id), x) : x);
    return [...m.values()].filter(alive);
  };
  const notes = mergeList(a.notes, b.notes).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0) || x.id.localeCompare(y.id));
  const customLanes = mergeList(a.customLanes, b.customLanes).sort((x, y) => (x.updatedAt || 0) - (y.updatedAt || 0) || x.id.localeCompare(y.id));
  const ha = a.hiddenLanesAt || 0, hb = b.hiddenLanesAt || 0;
  const hiddenLanes = ha === hb ? [...new Set([...a.hiddenLanes, ...b.hiddenLanes])].sort() : (hb > ha ? b.hiddenLanes : a.hiddenLanes);
  const deleted = [...delMap].map(([id, at]) => ({ id, at })).sort((x, y) => x.id.localeCompare(y.id));
  return { version: 1, notes, customLanes, hiddenLanes, hiddenLanesAt: Math.max(ha, hb), deleted };
}
export const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function parseImport(text) {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.notes)) throw new Error('旅箋の控えファイルではありません');
  const arr = v => (Array.isArray(v) ? v : []);
  return {
    version: 1,
    notes: raw.notes.map(normalizeNote).filter(n => n.text),
    customLanes: arr(raw.customLanes).filter(c => c && c.id && (c.label || c.start)).map(c => ({ id: String(c.id), label: String(c.label || '').slice(0, 40), start: c.start || '', end: c.end || '', updatedAt: Number(c.updatedAt) || 0 })),
    hiddenLanes: arr(raw.hiddenLanes).map(String),
    hiddenLanesAt: Number(raw.hiddenLanesAt) || 0,
    deleted: arr(raw.deleted).filter(d => d && d.id && d.at).map(d => ({ id: String(d.id), at: Number(d.at) })),
  };
}
