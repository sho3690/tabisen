// 旅箋 TABISEN — 画面の組み立てと操作。計算は logic.js に置く。
import * as L from './logic.js';

const KEY = 'tabisen.v1';
const $ = id => document.getElementById(id);
const DOW = ['日', '月', '火', '水', '木', '金', '土'];

// 一日の区切りは朝7時（夜更かしで0時を回っても「今日」のまま）
function todayDate() { const d = new Date(); if (d.getHours() < 7) d.setDate(d.getDate() - 1); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

let state = load();
let today = todayDate();
let lanes = [];
let undoSnapshot = null;
let editingId = null;
let toastTimer = null;

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return L.parseImport(raw); } catch (e) { /* 壊れていたら空から */ }
  return L.emptyState();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { showToast('保存できませんでした。ブラウザの保存領域を確認してください'); }
}
function commit(next, { undoable = false, toast = '' } = {}) {
  if (next === state) return;
  if (undoable) undoSnapshot = state;
  state = next;
  save();
  render();
  if (toast) showToast(toast, undoable);
}

// ---- 描画 ----
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const starsHtml = n => n ? `<span class="note-stars" aria-label="行きたい度 ${n}">${'★'.repeat(n)}<span class="off">${'★'.repeat(3 - n)}</span></span>` : '<span></span>';

function noteHtml(n, ctx) {
  const days = L.DAYS_LABEL[n.days] || '';
  const decided = n.decided && ctx === 'lane';
  return `<li class="note is-${n.color}${decided ? ' is-decided' : ''}" data-id="${n.id}" style="--rot:${n.rot}deg">
    ${decided ? '<span class="stamp" aria-hidden="true">決定</span>' : ''}
    <button type="button" class="note-body" data-action="edit" aria-label="${esc(n.text)}${decided ? '（決定）' : ''}。押すと直せます">
      <span class="note-text">${esc(n.text)}</span>
      ${n.memo ? `<span class="note-memo">${esc(n.memo)}</span>` : ''}
      <span class="note-meta">${starsHtml(n.stars)}<span>${esc(days)}</span></span>
    </button>
    ${ctx === 'lane' ? `<span class="note-actions">${decided
      ? '<button type="button" class="note-decide" data-action="undecide">決定を取り消す</button>'
      : '<button type="button" class="note-decide" data-action="decide">これで決定</button>'}</span>` : ''}
  </li>`;
}

const X_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
function laneHtml(lane) {
  const t = L.laneTitle(lane, today);
  const notes = state.notes.filter(n => n.laneId === lane.id);
  const winner = notes.find(n => n.decided);
  const rest = notes.filter(n => !n.decided);
  const key = L.ymd(today);
  const isNow = !!(lane.start && lane.end && lane.start <= key && lane.end >= key);
  const flag = winner ? '<span class="lane-flag">決定ずみ</span>' : isNow ? '<span class="lane-flag">いまの休み</span>' : '';
  const hide = lane.kind === 'auto'
    ? `<button type="button" class="lane-hide" data-lane-action="hide" aria-label="この休みを隠す" title="この休みを隠す">${X_ICON}</button>`
    : `<button type="button" class="lane-hide" data-lane-action="remove" aria-label="この休みを消す" title="この休みを消す">${X_ICON}</button>`;
  const body = notes.length
    ? (winner ? noteHtml(winner, 'lane') : '') + rest.map(n => noteHtml(n, 'lane')).join('')
    : '<li class="lane-empty">付箋をここへ</li>';
  return `<section class="lane${isNow ? ' is-now' : ''}${winner ? ' is-decided' : ''}" data-drop="${lane.id}" aria-label="${esc(t.title)} ${esc(t.eyebrow)}">
    <header class="lane-head">
      <p class="lane-eyebrow">${flag}${esc(t.eyebrow)}</p>
      <h3 class="lane-title">${esc(t.title)}</h3>
      ${t.sub ? `<p class="lane-sub">${esc(t.sub)}</p>` : ''}
      ${hide}
    </header>
    <ul class="lane-body notes">${body}</ul>
  </section>`;
}

function render() {
  lanes = L.buildLanes(state, today);
  const expired = L.expire(state, lanes);
  if (JSON.stringify(expired) !== JSON.stringify(state)) { state = expired; save(); }

  $('today-label').textContent = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日(${DOW[today.getDay()]})`;

  // 決まった旅
  const decidedItems = [];
  for (const lane of lanes) {
    const n = state.notes.find(x => x.decided && x.laneId === lane.id);
    if (!n) continue;
    const t = L.laneTitle(lane, today);
    const days = L.DAYS_LABEL[n.days];
    const sub = [t.eyebrow, t.sub].filter(Boolean).join('・');
    decidedItems.push(`<li class="decided-item"><span class="decided-when"><span class="decided-title">${esc(t.title)}</span><span class="decided-sub">${esc(sub)}</span></span><span class="decided-what">${esc(n.text)}${days ? `<span class="decided-days">${esc(days)}</span>` : ''}</span></li>`);
  }
  $('decided-list').innerHTML = decidedItems.join('');
  $('decided-section').hidden = decidedItems.length === 0;

  // 壁
  const wallNotes = state.notes.filter(n => !n.laneId);
  $('wall').innerHTML = wallNotes.map(n => noteHtml(n, 'wall')).join('');
  $('wall-count').textContent = wallNotes.length ? String(wallNotes.length) : '';
  $('wall-empty').hidden = state.notes.length > 0;

  // 休みの列（横スクロール位置は保つ）
  const lanesEl = $('lanes');
  const sl = lanesEl.scrollLeft;
  lanesEl.innerHTML = lanes.map(laneHtml).join('');
  lanesEl.scrollLeft = sl;
  const hidden = state.hiddenLanes.length;
  $('hidden-group').hidden = hidden === 0;
  $('hidden-count').textContent = hidden ? `× で隠した休みが ${hidden}件あります。戻すと Holidays に再び並びます。` : '';

  // 行った旅
  $('archive-section').hidden = state.archive.length === 0;
  $('archive-list').innerHTML = [...state.archive].sort((a, b) => b.start.localeCompare(a.start))
    .map(a => `<li class="archive-item"><span class="when">${esc(a.label)}</span><span>${esc(a.text)}</span></li>`).join('');
}

// ---- 通知と取り消し ----
function showToast(text, undoable = false) {
  const el = $('toast');
  $('toast-text').textContent = text;
  $('toast-undo').hidden = !undoable;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, undoable ? 8000 : 4000);
}
$('toast-undo').addEventListener('click', () => {
  if (!undoSnapshot) return;
  state = undoSnapshot; undoSnapshot = null;
  save(); render();
  $('toast').hidden = true;
});

// ---- 付箋を貼る ----
$('add-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('new-text');
  const text = input.value.trim();
  if (!text) { $('new-error').textContent = '行きたい場所ややりたいことを書いてください'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
  $('new-error').textContent = ''; input.removeAttribute('aria-invalid');
  const color = L.COLORS[state.notes.length % L.COLORS.length];
  commit(L.addNote(state, { text, color }));
  input.value = '';
  input.focus();
});
$('new-text').addEventListener('input', () => { $('new-error').textContent = ''; $('new-text').removeAttribute('aria-invalid'); });

const SAMPLE = [
  { text: '金沢で寿司とひがし茶屋街', stars: 3, days: '2', color: 'yellow' },
  { text: '箱根の温泉でだらだら', stars: 2, days: '1', color: 'pink' },
  { text: '直島でアート巡り', stars: 2, days: '2', color: 'mint' },
  { text: '河口湖から富士山を見る', stars: 1, days: 'day', color: 'sky' },
  { text: '京都の紅葉', stars: 3, days: '1', memo: '11月後半。宿は早めに', color: 'lavender' },
  { text: '沖縄でのんびり', stars: 2, days: '3plus', color: 'yellow' },
  { text: '鎌倉を歩いてしらす丼', stars: 1, days: 'day', color: 'mint' },
  { text: '北海道でスキー', stars: 2, days: '2', color: 'sky' },
];
$('add-sample').addEventListener('click', () => {
  let s = state;
  for (const n of SAMPLE) s = L.addNote(s, n);
  commit(s, { toast: 'サンプルの付箋を貼りました' });
});

// ---- 付箋・休みの操作（クリック） ----
let suppressClick = false;
document.addEventListener('click', e => {
  if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
  const btn = e.target.closest('[data-action]');
  if (btn) {
    const li = btn.closest('.note');
    const id = li.dataset.id;
    const action = btn.dataset.action;
    if (action === 'edit') openEditor(id);
    if (action === 'decide') {
      const lane = lanes.find(l => l.id === li.closest('[data-drop]').dataset.drop);
      const note = state.notes.find(n => n.id === id);
      if (!lane || !note) return;
      const returned = state.notes.filter(n => n.laneId === lane.id && n.id !== id).length;
      commit(L.decideNote(state, id, lane), { undoable: true, toast: `${L.laneTitle(lane, today).title} は「${note.text}」に決定${returned ? `。他の${returned}枚は Ideas へ戻しました` : ''}` });
    }
    if (action === 'undecide') commit(L.undecideNote(state, id), { toast: '決定を取り消しました' });
    return;
  }
  const laneBtn = e.target.closest('[data-lane-action]');
  if (laneBtn) {
    const laneId = laneBtn.closest('[data-drop]').dataset.drop;
    const lane = lanes.find(l => l.id === laneId);
    const moved = state.notes.filter(n => n.laneId === laneId).length;
    const tail = moved ? `。付箋${moved}枚は Ideas へ戻しました` : '';
    const title = L.laneTitle(lane, today).title;
    if (laneBtn.dataset.laneAction === 'hide') commit(L.hideLane(state, laneId), { undoable: true, toast: `${title} を隠しました（設定から戻せます）${tail}` });
    if (laneBtn.dataset.laneAction === 'remove') commit(L.removeCustomLane(state, laneId), { undoable: true, toast: `${title} を消しました${tail}` });
  }
}, true);
$('unhide-all').addEventListener('click', () => { $('settings').close(); commit(L.unhideAll(state), { toast: '隠した休みを戻しました' }); });

// ---- 編集シート ----
function openEditor(id) {
  const n = state.notes.find(x => x.id === id);
  if (!n) return;
  editingId = id;
  $('ed-text').value = n.text; $('ed-text').removeAttribute('aria-invalid'); $('ed-error').textContent = '';
  $('ed-memo').value = n.memo;
  document.querySelector(`#ed-colors input[value="${n.color}"]`).checked = true;
  document.querySelector(`#editor-form input[name="stars"][value="${n.stars}"]`).checked = true;
  document.querySelector(`#editor-form input[name="days"][value="${n.days}"]`).checked = true;
  const chips = [`<label class="chip"><input type="radio" name="lane" value=""${!n.laneId ? ' checked' : ''}>まだ決めない<small>Ideas に置いておく</small></label>`];
  for (const lane of lanes) {
    const t = L.laneTitle(lane, today);
    const sub = [t.eyebrow, t.sub].filter(Boolean).join('・');
    chips.push(`<label class="chip"><input type="radio" name="lane" value="${lane.id}"${n.laneId === lane.id ? ' checked' : ''}>${esc(t.title)}<small>${esc(sub)}</small></label>`);
  }
  chips.push('<label class="chip"><input type="radio" name="lane" value="__dates__">日付を選んで貼る<small>好きな日程で新しい休みを作る</small></label>');
  $('ed-lanes').innerHTML = chips.join('');
  $('ed-dates').hidden = true; $('ed-start').value = ''; $('ed-end').value = ''; $('ed-dates-error').textContent = ''; $('ed-start').removeAttribute('aria-invalid');
  $('editor').showModal();
  $('ed-text').focus();
}
$('editor-form').addEventListener('submit', e => {
  e.preventDefault();
  const n = state.notes.find(x => x.id === editingId);
  if (!n) { $('editor').close(); return; }
  const text = $('ed-text').value.trim();
  if (!text) { $('ed-error').textContent = '行きたい場所ややりたいことを書いてください'; $('ed-text').setAttribute('aria-invalid', 'true'); $('ed-text').focus(); return; }
  const f = new FormData(e.target);
  let s = L.updateNote(state, editingId, { text, memo: $('ed-memo').value, color: f.get('color'), stars: Number(f.get('stars')), days: f.get('days') });
  let laneId = f.get('lane') || null;
  if (laneId === '__dates__') {
    const start = $('ed-start').value, end = $('ed-end').value || $('ed-start').value;
    if (!start) { $('ed-dates-error').textContent = 'はじまりの日付を選んでください'; $('ed-start').setAttribute('aria-invalid', 'true'); $('ed-start').focus(); return; }
    const existing = L.findDateLane(s, start, end);
    if (existing) laneId = existing.id;
    else { s = L.addCustomLane(s, { label: '', start, end }); laneId = s.customLanes.at(-1).id; }
  }
  if (laneId !== n.laneId) s = L.moveNote(s, editingId, laneId);
  $('editor').close();
  commit(s);
});
$('ed-delete').addEventListener('click', () => {
  const n = state.notes.find(x => x.id === editingId);
  $('editor').close();
  if (n) commit(L.deleteNote(state, editingId), { undoable: true, toast: `「${n.text}」を消しました` });
});
for (const dlg of document.querySelectorAll('dialog.sheet')) {
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
}

// ---- 休みを足す ----
function openLaneEditor() {
  $('ln-label').value = ''; $('ln-start').value = ''; $('ln-end').value = ''; $('ln-error').textContent = ''; $('ln-start').removeAttribute('aria-invalid');
  $('lane-editor').showModal();
  $('ln-start').focus();
}
$('add-lane').addEventListener('click', openLaneEditor);
$('lane-form').addEventListener('submit', e => {
  e.preventDefault();
  const label = $('ln-label').value.trim();
  const start = $('ln-start').value, end = $('ln-end').value;
  if (!label && !start && !end) { $('ln-error').textContent = '日付か名前のどちらかを入れてください'; $('ln-start').setAttribute('aria-invalid', 'true'); $('ln-start').focus(); return; }
  const next = L.addCustomLane(state, { label, start, end });
  $('lane-editor').close();
  const lane = next.customLanes.at(-1);
  commit(next, { toast: `${L.laneTitle({ ...lane, kind: 'custom' }, today).title} を足しました` });
});
$('ed-lanes').addEventListener('change', e => {
  if (e.target.name !== 'lane') return;
  $('ed-dates').hidden = e.target.value !== '__dates__';
  if (!$('ed-dates').hidden) $('ed-start').focus();
});

// ---- 設定シート ----
$('open-settings').addEventListener('click', () => { $('clear-confirm').hidden = true; $('settings').showModal(); });
$('import-btn').addEventListener('click', () => $('import-file').click());

// ---- コピー・控え ----
$('copy-decided').addEventListener('click', async () => {
  const text = L.decidedText(state, lanes);
  try { await navigator.clipboard.writeText(text); showToast('決まった旅の文面をコピーしました'); }
  catch (e) { showToast('コピーできませんでした。手で選んでコピーしてください'); }
});
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tabisen-${L.ymd(today)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { commit(L.parseImport(reader.result), { undoable: true, toast: `控えを読み込みました（付箋${JSON.parse(reader.result).notes.length}枚）` }); }
    catch (err) { showToast('読み込めませんでした。旅箋で書き出した JSON を選んでください'); }
    e.target.value = '';
  };
  reader.readAsText(file);
});
$('clear-all').addEventListener('click', () => { $('clear-confirm').hidden = false; $('clear-yes').focus(); });
$('clear-no').addEventListener('click', () => { $('clear-confirm').hidden = true; $('clear-all').focus(); });
$('clear-yes').addEventListener('click', () => { $('clear-confirm').hidden = true; $('settings').close(); commit(L.emptyState(), { undoable: true, toast: 'すべて消しました' }); });

// ---- ドラッグ（PC はそのまま、タッチは長押しで始める） ----
let drag = null;
const ghost = $('drag-ghost');
function startDrag(x, y) {
  if (!drag || drag.active) return;
  drag.active = true;
  suppressClick = true;
  const li = drag.el;
  const r = li.getBoundingClientRect();
  drag.offX = x - r.left; drag.offY = y - r.top;
  ghost.className = `note ghost ${[...li.classList].filter(c => c.startsWith('is-')).join(' ')}`;
  ghost.innerHTML = li.innerHTML;
  ghost.style.width = `${r.width}px`;
  ghost.hidden = false;
  li.classList.add('is-dragging');
  document.body.classList.add('is-dragging');
  moveGhost(x, y);
  if (navigator.vibrate) navigator.vibrate(10);
  drag.raf = requestAnimationFrame(autoScrollTick);
}
function moveGhost(x, y) {
  ghost.style.setProperty('--gx', `${x - drag.offX}px`);
  ghost.style.setProperty('--gy', `${y - drag.offY}px`);
  drag.lastX = x; drag.lastY = y;
}
function targetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest('[data-drop]') : null;
}
function updateTarget(x, y) {
  const t = targetAt(x, y);
  if (t !== drag.target) {
    if (drag.target) drag.target.classList.remove('is-over');
    drag.target = t;
    if (t) t.classList.add('is-over');
  }
}
function autoScrollTick() {
  if (!drag || !drag.active) return;
  const edge = 56, speed = 10;
  const lanesEl = $('lanes');
  const lr = lanesEl.getBoundingClientRect();
  if (drag.lastY >= lr.top && drag.lastY <= lr.bottom) {
    if (drag.lastX < lr.left + edge) lanesEl.scrollLeft -= speed;
    else if (drag.lastX > lr.right - edge) lanesEl.scrollLeft += speed;
  }
  if (drag.lastY < edge) window.scrollBy(0, -speed);
  else if (drag.lastY > window.innerHeight - edge) window.scrollBy(0, speed);
  updateTarget(drag.lastX, drag.lastY);
  drag.raf = requestAnimationFrame(autoScrollTick);
}
function endDrag(drop) {
  if (!drag) return;
  clearTimeout(drag.timer);
  cancelAnimationFrame(drag.raf);
  const { el, id, target, active } = drag;
  drag = null;
  if (!active) return;
  ghost.hidden = true;
  el.classList.remove('is-dragging');
  document.body.classList.remove('is-dragging');
  if (target) target.classList.remove('is-over');
  setTimeout(() => { suppressClick = false; }, 0);
  if (!drop || !target) return;
  const laneId = target.dataset.drop || null;
  const note = state.notes.find(n => n.id === id);
  if (!note || note.laneId === laneId) return;
  const lane = lanes.find(l => l.id === laneId);
  commit(L.moveNote(state, id, laneId), { toast: laneId ? `「${note.text}」を ${L.laneTitle(lane, today).title} に貼りました` : `「${note.text}」を Ideas へ戻しました` });
}
document.addEventListener('pointerdown', e => {
  const body = e.target.closest('.note-body');
  if (!body || e.button !== 0) return;
  const li = body.closest('.note');
  if (!li || li.classList.contains('is-decided') || li.classList.contains('ghost')) return;
  drag = { id: li.dataset.id, el: li, startX: e.clientX, startY: e.clientY, active: false, touch: e.pointerType !== 'mouse', target: null };
  if (drag.touch) drag.timer = setTimeout(() => startDrag(e.clientX, e.clientY), 320);
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8) {
      if (drag.touch) { clearTimeout(drag.timer); drag = null; }   // 指が動いたらスクロール
      else startDrag(e.clientX, e.clientY);
    }
    return;
  }
  moveGhost(e.clientX, e.clientY);
  updateTarget(e.clientX, e.clientY);
});
document.addEventListener('pointerup', () => endDrag(true));
document.addEventListener('pointercancel', () => endDrag(false));
document.addEventListener('touchmove', e => { if (drag && drag.active) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => { if (e.target.closest('.note')) e.preventDefault(); });

// ---- 起動 ----
render();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = todayDate();
  if (L.ymd(t) !== L.ymd(today)) { today = t; render(); }
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
// ブラウザに「この保存領域は消さないで」と頼む（容量不足のときの自動削除を防ぐ。対応していない端末では何もしない）
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
