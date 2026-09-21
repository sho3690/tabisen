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
export function formatRange(start, end) {
  const a = parseYmd(start), b = parseYmd(end);
  const md = x => `${x.getMonth() + 1}/${x.getDate()}(${DOW[x.getDay()]})`;
  if (start === end) return md(a);
  const bTxt = a.getMonth() === b.getMonth() ? `${b.getDate()}(${DOW[b.getDay()]})` : md(b);
  return `${md(a)}〜${bTxt}`;
}
export function laneTitle(lane, today) {
  if (lane.kind === 'someday') return { title: 'いつか', sub: '時期は未定' };
  const yearNote = today && lane.start && lane.start.slice(0, 4) !== ymd(today).slice(0, 4) ? `${lane.start.slice(0, 4)}年・` : '';
  if (lane.kind === 'custom') {
    if (!lane.start) return { title: lane.label, sub: '日程は未定' };
    const n = Math.round((parseYmd(lane.end) - parseYmd(lane.start)) / 86400000) + 1;
    return { title: lane.label, sub: `${yearNote}${formatRange(lane.start, lane.end)}・${n}日間` };
  }
  const sub = lane.tag ? `${lane.tag}・${lane.days}連休` : [`${lane.days}連休`, ...lane.names].join('・');
  return { title: formatRange(lane.start, lane.end), sub: yearNote + sub };
}

// ---- 状態 ----
export const emptyState = () => ({ version: 1, notes: [], customLanes: [], hiddenLanes: [], archive: [] });
let seq = 0;
const uid = p => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const randomRot = () => Math.round((Math.random() * 4 - 2) * 2) / 2;

function normalizeNote(n) {
  return {
    id: String(n.id || uid('n')),
    text: String(n.text || '').trim().slice(0, 60),
    memo: String(n.memo || '').trim().slice(0, 300),
    color: COLORS.includes(n.color) ? n.color : 'yellow',
    stars: [0, 1, 2, 3].includes(n.stars) ? n.stars : 0,
    days: Object.hasOwn(DAYS_LABEL, n.days || '') ? (n.days || '') : '',
    laneId: n.laneId ? String(n.laneId) : null,
    decided: !!n.decided,
    decidedLabel: n.decidedLabel ? String(n.decidedLabel) : '',
    rot: typeof n.rot === 'number' && n.rot >= -2 && n.rot <= 2 ? n.rot : randomRot(),
    createdAt: n.createdAt || Date.now(),
  };
}

export function buildLanes(state, today) {
  const todayKey = ymd(today);
  const hidden = new Set(state.hiddenLanes);
  const auto = holidayWindows(today).filter(w => !hidden.has(w.id));
  const custom = state.customLanes.map(c => ({ ...c, kind: 'custom' })).filter(c => !c.end || c.end >= todayKey);
  const dated = [...auto, ...custom.filter(c => c.start)].sort((a, b) => a.start.localeCompare(b.start));
  const undated = custom.filter(c => !c.start);
  return [...dated, ...undated, { id: 'someday', kind: 'someday' }];
}

export function addNote(state, fields) {
  const note = normalizeNote({ ...fields, id: undefined });
  if (!note.text) return state;
  return { ...state, notes: [...state.notes, note] };
}
export function updateNote(state, id, fields) {
  return { ...state, notes: state.notes.map(n => (n.id === id ? normalizeNote({ ...n, ...fields, id }) : n)) };
}
export function deleteNote(state, id) {
  return { ...state, notes: state.notes.filter(n => n.id !== id) };
}
export function moveNote(state, id, laneId) {
  return { ...state, notes: state.notes.map(n => (n.id === id ? { ...n, laneId: laneId || null, decided: false, decidedLabel: '' } : n)) };
}
export function decideNote(state, id, lane) {
  const label = laneTitle(lane).title;
  return {
    ...state,
    notes: state.notes.map(n => {
      if (n.id === id) return { ...n, laneId: lane.id, decided: true, decidedLabel: label };
      if (n.laneId === lane.id) return { ...n, laneId: null, decided: false, decidedLabel: '' };
      return n;
    }),
  };
}
export function undecideNote(state, id) {
  return { ...state, notes: state.notes.map(n => (n.id === id ? { ...n, decided: false, decidedLabel: '' } : n)) };
}
function releaseLane(state, laneId) {
  return state.notes.map(n => (n.laneId === laneId ? { ...n, laneId: null, decided: false, decidedLabel: '' } : n));
}
export function hideLane(state, laneId) {
  if (state.hiddenLanes.includes(laneId)) return state;
  return { ...state, hiddenLanes: [...state.hiddenLanes, laneId], notes: releaseLane(state, laneId) };
}
export function unhideAll(state) { return { ...state, hiddenLanes: [] }; }
export function addCustomLane(state, { label, start, end }) {
  const l = String(label || '').trim().slice(0, 40);
  if (!l) return state;
  let s = start || '', e = end || '';
  if (s && !e) e = s;
  if (e && !s) s = e;
  if (s && e && e < s) [s, e] = [e, s];
  const lane = { id: uid('custom:'), label: l, start: s, end: e };
  return { ...state, customLanes: [...state.customLanes, lane] };
}
export function removeCustomLane(state, laneId) {
  return { ...state, customLanes: state.customLanes.filter(c => c.id !== laneId), notes: releaseLane(state, laneId) };
}
// 過ぎた休みを片づける: 決定済みは「行った旅」へ、未決定は壁へ戻す。
export function expire(state, lanes) {
  const live = new Set(lanes.map(l => l.id));
  const archive = [...state.archive];
  const notes = [];
  for (const n of state.notes) {
    if (!n.laneId || live.has(n.laneId)) { notes.push(n); continue; }
    if (n.decided) archive.push({ text: n.text, label: n.decidedLabel, start: n.laneId.startsWith('auto:') ? n.laneId.slice(5) : '' });
    else notes.push({ ...n, laneId: null, decided: false, decidedLabel: '' });
  }
  const customLanes = state.customLanes.filter(c => live.has(c.id));
  return { ...state, notes, archive, customLanes };
}

export function decidedText(state, lanes) {
  const lines = [];
  for (const lane of lanes) {
    const n = state.notes.find(x => x.decided && x.laneId === lane.id);
    if (!n) continue;
    const days = DAYS_LABEL[n.days] ? `（${DAYS_LABEL[n.days]}）` : '';
    lines.push(`${laneTitle(lane).title}　${n.text}${days}`);
  }
  return lines.join('\n');
}

export function parseImport(text) {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.notes)) throw new Error('旅箋の控えファイルではありません');
  const arr = v => (Array.isArray(v) ? v : []);
  return {
    version: 1,
    notes: raw.notes.map(normalizeNote).filter(n => n.text),
    customLanes: arr(raw.customLanes).filter(c => c && c.id && c.label).map(c => ({ id: String(c.id), label: String(c.label).slice(0, 40), start: c.start || '', end: c.end || '' })),
    hiddenLanes: arr(raw.hiddenLanes).map(String),
    archive: arr(raw.archive).filter(a => a && a.text).map(a => ({ text: String(a.text), label: String(a.label || ''), start: String(a.start || '') })),
  };
}
