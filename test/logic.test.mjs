import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jpHolidays, holidayWindows, formatRange, dowRange, buildLanes, laneTitle,
  emptyState, addNote, updateNote, deleteNote, moveNote,
  hideLane, addCustomLane, removeCustomLane, findDateLane, expire, parseImport, mergeStates,
} from '../logic.js';

const d = s => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };

test('2026年の祝日（振替・国民の休日を含む）', () => {
  const h = jpHolidays(2026);
  assert.equal(h.get('2026-01-12'), '成人の日');
  assert.equal(h.get('2026-03-20'), '春分の日');
  assert.equal(h.get('2026-05-06'), '振替休日');   // 5/3 が日曜
  assert.equal(h.get('2026-07-20'), '海の日');
  assert.equal(h.get('2026-09-21'), '敬老の日');
  assert.equal(h.get('2026-09-22'), '国民の休日'); // 敬老の日と秋分の日に挟まれる
  assert.equal(h.get('2026-09-23'), '秋分の日');
  assert.equal(h.get('2026-10-12'), 'スポーツの日');
  assert.equal(h.get('2026-11-23'), '勤労感謝の日');
  assert.equal(h.has('2026-09-24'), false);
});

test('2027年の祝日', () => {
  const h = jpHolidays(2027);
  assert.equal(h.get('2027-01-11'), '成人の日');
  assert.equal(h.get('2027-03-21'), '春分の日');
  assert.equal(h.get('2027-03-22'), '振替休日');
  assert.equal(h.get('2027-07-19'), '海の日');
  assert.equal(h.get('2027-09-20'), '敬老の日');
  assert.equal(h.get('2027-09-23'), '秋分の日');
  assert.equal(h.get('2027-10-11'), 'スポーツの日');
});

test('連休の列挙: 今日を含む連休は丸ごと、過ぎたものは出さない', () => {
  const w = holidayWindows(d('2026-09-21'), 12);
  assert.equal(w[0].start, '2026-09-19');
  assert.equal(w[0].end, '2026-09-23');
  assert.equal(w[0].days, 5);
  assert.deepEqual(w[0].names, ['敬老の日', '秋分の日']);
  const oct = w.find(x => x.start === '2026-10-10');
  assert.equal(oct.end, '2026-10-12');
  assert.equal(oct.days, 3);
  const ye = w.find(x => x.tag === '年末年始');
  assert.equal(ye.start, '2026-12-29'); // 12/28(月)は平日
  assert.equal(ye.end, '2027-01-03');
  const gw = w.find(x => x.tag === 'ゴールデンウィーク');
  assert.equal(gw.start, '2027-05-01');
  assert.equal(gw.end, '2027-05-05');
  assert.ok(w.every(x => x.days >= 3));
  assert.ok(w.every(x => x.end >= '2026-09-21'));
});

test('formatRange / dowRange: 数字が主役、曜日は別', () => {
  assert.equal(formatRange('2026-10-10', '2026-10-12'), '10/10–12');
  assert.equal(formatRange('2026-12-26', '2027-01-03'), '12/26–1/3');
  assert.equal(formatRange('2026-11-03', '2026-11-03'), '11/3');
  assert.equal(dowRange('2026-10-10', '2026-10-12'), '土〜月');
  assert.equal(dowRange('2026-11-03', '2026-11-03'), '火');
});

test('buildLanes: 自動 + 自分の休み、時系列、非表示を除く（「いつか」は無い）', () => {
  let s = emptyState();
  s = addCustomLane(s, { label: '有休をとって平日', start: '2026-10-28', end: '2026-10-30' });
  s = addCustomLane(s, { label: '日程はこれから' });
  s = hideLane(s, 'auto:2026-10-10');
  const lanes = buildLanes(s, d('2026-09-21'));
  assert.equal(lanes[0].id, 'auto:2026-09-19');
  assert.ok(!lanes.some(l => l.id === 'auto:2026-10-10'));
  const i1 = lanes.findIndex(l => l.label === '有休をとって平日');
  const iNov = lanes.findIndex(l => l.id === 'auto:2026-11-21');
  assert.ok(i1 > 0 && i1 < iNov, '日付つきの自分の休みは日付順に混ざる');
  assert.ok(!lanes.some(l => l.kind === 'someday'));
  assert.equal(lanes.at(-1).label, '日程はこれから');
  assert.deepEqual(laneTitle(lanes.at(-1)), { eyebrow: '日程は未定', title: '日程はこれから', sub: '' });
  const t = laneTitle(lanes[0], d('2026-09-21'));
  assert.deepEqual(t, { eyebrow: '土〜水・5連休', title: '9/19–23', sub: '敬老の日・秋分の日' });
  const y = laneTitle(lanes.find(l => l.id === 'auto:2026-12-29'), d('2026-09-21'));
  assert.deepEqual(y, { eyebrow: '火〜日・6連休', title: '12/29–1/3', sub: '年末年始' });
  const gw = laneTitle(lanes.find(l => l.id === 'auto:2027-05-01'), d('2026-09-21'));
  assert.equal(gw.eyebrow, '2027・土〜水・5連休');
});

test('付箋の追加・更新・移動・削除', () => {
  let s = emptyState();
  s = addNote(s, { text: '金沢' });
  s = addNote(s, { text: '箱根' });
  s = addNote(s, { text: '  ' }); // 空は無視
  assert.equal(s.notes.length, 2);
  const [kanazawa, hakone] = s.notes;
  assert.ok(kanazawa.rot >= -2 && kanazawa.rot <= 2);
  s = updateNote(s, kanazawa.id, { stars: 3, days: '2', color: 'mint' });
  assert.equal(s.notes[0].stars, 3);
  s = moveNote(s, kanazawa.id, 'auto:2026-10-10');
  s = moveNote(s, hakone.id, 'auto:2026-10-10');
  assert.ok(s.notes.every(n => n.laneId === 'auto:2026-10-10'), '同じ休みに何枚でも貼れる');
  s = moveNote(s, hakone.id, null);
  assert.equal(s.notes[1].laneId, null);
  s = deleteNote(s, hakone.id);
  assert.equal(s.notes.length, 1);
});

test('hideLane / removeCustomLane は付箋を壁へ戻す', () => {
  let s = emptyState();
  s = addNote(s, { text: '金沢' });
  s = addCustomLane(s, { label: '有休' });
  const cid = s.customLanes[0].id;
  s = moveNote(s, s.notes[0].id, cid);
  s = removeCustomLane(s, cid);
  assert.equal(s.customLanes.length, 0);
  assert.equal(s.notes[0].laneId, null);
  s = moveNote(s, s.notes[0].id, 'auto:2026-10-10');
  s = hideLane(s, 'auto:2026-10-10');
  assert.deepEqual(s.hiddenLanes, ['auto:2026-10-10']);
  assert.equal(s.notes[0].laneId, null);
});

test('expire: 過ぎた連休の付箋は Ideas へ戻る。自分で作った休みは過ぎても残る', () => {
  let s = emptyState();
  s = addNote(s, { text: '金沢' });
  s = addNote(s, { text: '箱根' });
  s = addCustomLane(s, { label: '1日目', start: '2026-09-23', end: '2026-09-23' });
  const cid = s.customLanes[0].id;
  s = moveNote(s, s.notes[0].id, 'auto:2026-09-19');
  s = moveNote(s, s.notes[1].id, cid);
  const lanes = buildLanes(s, d('2026-10-01'));
  assert.ok(lanes.some(l => l.id === cid), '過ぎた自分の休みも列に残る');
  s = expire(s, lanes);
  assert.equal(s.notes[0].laneId, null, '過ぎた連休の付箋は Ideas へ');
  assert.equal(s.notes[1].laneId, cid, '自分の休みに貼ったものはそのまま');
  assert.equal(s.customLanes.length, 1);
});

test('parseImport: 壊れたデータは受け付けない', () => {
  assert.throws(() => parseImport('{"notes": "x"}'));
  assert.throws(() => parseImport('not json'));
  const ok = parseImport(JSON.stringify({ version: 1, notes: [{ id: 'a', text: '金沢' }] }));
  assert.equal(ok.notes[0].text, '金沢');
  assert.equal(ok.notes[0].stars, 0);
  assert.deepEqual(ok.customLanes, []);
});

test('日付だけの休み: 名前が空なら日付が名前になる。同じ日程は再利用', () => {
  let s = emptyState();
  s = addCustomLane(s, { start: '2026-09-23', end: '2026-09-26' });
  s = addCustomLane(s, { start: '2026-09-23' });           // おわりが空 → 1日
  s = addCustomLane(s, { label: '', start: '', end: '' });  // 何も無い → 無視
  assert.equal(s.customLanes.length, 2);
  const lanes = buildLanes(s, d('2026-09-21'));
  const t = laneTitle(lanes.find(l => l.id === s.customLanes[0].id), d('2026-09-21'));
  assert.deepEqual(t, { eyebrow: '水〜土・4日間', title: '9/23–26', sub: '自分で選んだ日程' });
  assert.equal(findDateLane(s, '2026-09-23', '2026-09-26').id, s.customLanes[0].id);
  assert.equal(findDateLane(s, '2026-09-23', '').id, s.customLanes[1].id);
  assert.equal(findDateLane(s, '2026-10-01', '2026-10-02'), null);
  const ok = parseImport(JSON.stringify({ version: 1, notes: [], customLanes: [{ id: 'c1', label: '', start: '2026-09-23', end: '2026-09-26' }] }));
  assert.equal(ok.customLanes.length, 1);
});

test('更新時刻と削除の記録', () => {
  let s = emptyState();
  s = addNote(s, { text: '金沢' });
  const t0 = s.notes[0].updatedAt;
  assert.ok(t0 > 0);
  s = deleteNote(s, s.notes[0].id);
  assert.equal(s.deleted.length, 1);
  s = addCustomLane(s, { label: '有休' });
  const cid = s.customLanes[0].id;
  assert.ok(s.customLanes[0].updatedAt > 0);
  s = removeCustomLane(s, cid);
  assert.deepEqual(s.deleted.map(d => d.id).sort(), [cid, s.deleted.find(d => d.id !== cid).id].sort());
  s = hideLane(s, 'auto:2026-10-10');
  assert.ok(s.hiddenLanesAt > 0);
});

test('mergeStates: 新しいほうが勝つ、消した記録は両方に効く、順番を入れ替えても同じ', () => {
  const note = (id, text, updatedAt, extra = {}) => ({ id, text, memo: '', color: 'yellow', stars: 0, days: '', laneId: null, decided: false, decidedLabel: '', rot: 0, createdAt: 1, updatedAt, ...extra });
  const a = { ...emptyState(), notes: [note('n1', '金沢', 100), note('n2', '箱根', 100), note('n3', 'Aだけ', 50)], hiddenLanes: ['auto:x'], hiddenLanesAt: 10, deleted: [] };
  const b = { ...emptyState(), notes: [note('n1', '金沢（B で直した）', 200), note('n4', 'Bだけ', 60)], hiddenLanes: [], hiddenLanesAt: 20, deleted: [{ id: 'n2', at: 150 }] };
  const m = mergeStates(a, b);
  assert.deepEqual(m.notes.map(n => n.text), ['金沢（B で直した）', 'Aだけ', 'Bだけ']);
  assert.deepEqual(m.hiddenLanes, [], '隠す設定は新しい B の状態');
  assert.deepEqual(mergeStates(b, a), m, '順番に依らない');
  // 消したあとに別の端末で直した付箋は、直したほうが新しければ残る
  const c = { ...emptyState(), notes: [note('n2', '箱根（消したあとに直した）', 300)] };
  assert.equal(mergeStates(b, c).notes.length, 3);
  // 自分の休みも同じ規則
  const la = { ...emptyState(), customLanes: [{ id: 'c1', label: 'A', start: '', end: '', updatedAt: 1 }] };
  const lb = { ...emptyState(), deleted: [{ id: 'c1', at: 5 }] };
  assert.equal(mergeStates(la, lb).customLanes.length, 0);
  // 空の状態と合流しても壊れない
  assert.deepEqual(mergeStates(emptyState(), emptyState()), emptyState());
});

test('parseImport は同期用の項目を保つ', () => {
  const ok = parseImport(JSON.stringify({ version: 1, notes: [{ id: 'a', text: '金沢', updatedAt: 5 }], customLanes: [{ id: 'c', label: 'x', updatedAt: 7 }], hiddenLanesAt: 9, deleted: [{ id: 'z', at: 3 }] }));
  assert.equal(ok.notes[0].updatedAt, 5);
  assert.equal(ok.customLanes[0].updatedAt, 7);
  assert.equal(ok.hiddenLanesAt, 9);
  assert.deepEqual(ok.deleted, [{ id: 'z', at: 3 }]);
});
