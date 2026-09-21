import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jpHolidays, holidayWindows, formatRange, buildLanes, laneTitle, decidedText,
  emptyState, addNote, updateNote, deleteNote, moveNote, decideNote, undecideNote,
  hideLane, addCustomLane, removeCustomLane, findDateLane, expire, parseImport,
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

test('formatRange', () => {
  assert.equal(formatRange('2026-10-10', '2026-10-12'), '10/10(土)〜12(月)');
  assert.equal(formatRange('2026-12-26', '2027-01-03'), '12/26(土)〜1/3(日)');
  assert.equal(formatRange('2026-11-03', '2026-11-03'), '11/3(火)');
});

test('buildLanes: 自動 + 自分の休み + いつか、時系列、非表示を除く', () => {
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
  assert.equal(lanes.at(-1).id, 'someday');
  assert.equal(lanes.at(-2).label, '日程はこれから');
  const t = laneTitle(lanes[0]);
  assert.equal(t.title, '9/19(土)〜23(水)');
  assert.equal(t.sub, '5連休・敬老の日・秋分の日');
  const y = laneTitle(lanes.find(l => l.id === 'auto:2026-12-29'));
  assert.equal(y.sub, '年末年始・6連休');
});

test('付箋の追加・更新・移動・決定・取り消し・削除', () => {
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
  const lane = { id: 'auto:2026-10-10', start: '2026-10-10', end: '2026-10-12', days: 3, names: ['スポーツの日'], kind: 'auto' };
  s = decideNote(s, kanazawa.id, lane);
  assert.equal(s.notes[0].decided, true);
  assert.equal(s.notes[0].decidedLabel, '10/10(土)〜12(月)');
  assert.equal(s.notes[1].laneId, null, '同じ休みの他の付箋は壁へ戻る');
  s = moveNote(s, hakone.id, 'auto:2026-10-10');
  assert.equal(s.notes[1].laneId, 'auto:2026-10-10', '決定後も候補は貼れる');
  s = undecideNote(s, kanazawa.id);
  assert.equal(s.notes[0].decided, false);
  assert.equal(s.notes[0].laneId, 'auto:2026-10-10');
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

test('expire: 過ぎた休みは、決定済みなら行った旅へ、未決定なら壁へ', () => {
  let s = emptyState();
  s = addNote(s, { text: '金沢' });
  s = addNote(s, { text: '箱根' });
  const lane = { id: 'auto:2026-09-19', start: '2026-09-19', end: '2026-09-23', days: 5, names: [], kind: 'auto' };
  s = moveNote(s, s.notes[0].id, lane.id);
  s = decideNote(s, s.notes[0].id, lane);
  s = moveNote(s, s.notes[1].id, 'auto:2026-09-12'); // 存在しない過去の休み
  const lanes = buildLanes(s, d('2026-10-01'));
  s = expire(s, lanes);
  assert.equal(s.notes.length, 1);
  assert.equal(s.notes[0].text, '箱根');
  assert.equal(s.notes[0].laneId, null);
  assert.equal(s.archive.length, 1);
  assert.equal(s.archive[0].text, '金沢');
  assert.equal(s.archive[0].label, '9/19(土)〜23(水)');
});

test('decidedText: コピー用の文面', () => {
  let s = emptyState();
  s = addNote(s, { text: '金沢', days: '2' });
  const lane = { id: 'auto:2026-10-10', start: '2026-10-10', end: '2026-10-12', days: 3, names: ['スポーツの日'], kind: 'auto' };
  s = moveNote(s, s.notes[0].id, lane.id);
  s = decideNote(s, s.notes[0].id, lane);
  const lanes = buildLanes(s, d('2026-09-21'));
  assert.equal(decidedText(s, lanes), '10/10(土)〜12(月)　金沢（2泊）');
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
  const t = laneTitle(lanes.find(l => l.id === s.customLanes[0].id));
  assert.equal(t.title, '9/23(水)〜26(土)');
  assert.equal(t.sub, '4日間・自分で選んだ日程');
  assert.equal(findDateLane(s, '2026-09-23', '2026-09-26').id, s.customLanes[0].id);
  assert.equal(findDateLane(s, '2026-09-23', '').id, s.customLanes[1].id);
  assert.equal(findDateLane(s, '2026-10-01', '2026-10-02'), null);
  const ok = parseImport(JSON.stringify({ version: 1, notes: [], customLanes: [{ id: 'c1', label: '', start: '2026-09-23', end: '2026-09-26' }] }));
  assert.equal(ok.customLanes.length, 1);
});
