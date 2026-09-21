# 旅箋 TABISEN — 設計メモ（2026-09-21）

## 課題
行きたい場所・やりたいことが多すぎて、「いつ・どこへ行くか」が決まり切らない。
候補を並べるだけのアプリは多いが、決めるところまで連れて行ってくれるものが無い。

## 考え方: 「行き先を選ぶ」のではなく「休みに貼る」
- 頭の中の候補は、まず全部 **付箋** にして貼り出す（ブレストの壁）。
- 決める相手は行き先ではなく **休み**。祝日から次の1年の連休を自動で並べ、そこへ付箋を貼っていく。
  休みの数は有限なので、貼れば貼るほど自然に絞られる。
- ひとつの休みに付箋が重なったら、「これで決定」を押す。残りは壁に戻る。
- 上部に「決まった旅」が時系列で並ぶ。これがこのアプリの答え。

## 方針
- 素の HTML / CSS / JS の PWA。ビルド不要。公開先は sho3690.github.io/tabisen（push はユーザーの指示があるまでしない）。
- データは端末の localStorage（キー `tabisen.v1`）だけ。外部送信なし・認証なし。
- 見た目は `~/.claude/design-system.md`。周りの枠は落ち着いた中立色＋控えめな青、付箋だけ紙の色（黄・桃・緑・空・藤）。
- ダークモードは端末設定に追従。付箋は暗い机の上の紙として明るいまま残す。
- 操作は「タップして編集シートで休みを選ぶ」を基本にし、ドラッグ（PC はそのまま、スマホは長押し）も使える。

## 画面（1ページ）
| 区画 | 役割 |
|---|---|
| 決まった旅 | 決定した「休み → 付箋」を時系列で。テキストとしてコピーできる |
| 付箋の壁 | 追加欄（テキスト1行）＋未整理の付箋。押すと編集シート |
| いつ行く？ | 休みの列を横に並べる。自動の連休（3日以上）＋「いつか」＋自分で足した休み。列の中の付箋に「これで決定」 |
| 編集シート | 文言・メモ・色・行きたい度（★1〜3）・日数の目安・いつ行くか・削除 |
| 控え | JSON の書き出し / 読み込み、サンプル、全削除 |

## データ
```
{ version: 1,
  notes: [{ id, text, memo, color: 'yellow'|'pink'|'mint'|'sky'|'lavender', stars: 0..3,
            days: ''|'day'|'1'|'2'|'3plus', laneId: null|string, decided: bool, decidedLabel?: string,
            rot: -2..2, createdAt }],
  customLanes: [{ id: 'custom:<n>', label, start?: 'YYYY-MM-DD', end?: 'YYYY-MM-DD' }],
  hiddenLanes: ['auto:YYYY-MM-DD', ...],
  archive: [{ text, label, start }] }
```
自動の休みの id は開始日（`auto:2026-10-10`）なので、日付が変わっても同じ休みを指す。

## ロジック（logic.js、純粋関数。test/ で検証）
- `jpHolidays(year)`: 固定日・ハッピーマンデー・春分秋分（近似式）・振替休日・国民の休日。
- `holidayWindows(today, months)`: 土日・祝日・年末年始（12/29〜1/3）が3日以上続く区間を、今日以降で列挙。
- `buildLanes(state, today)`: 自動＋自分の休み＋「いつか」を時系列に並べる（非表示のものは除く）。
- 状態遷移: `addNote` `updateNote` `deleteNote` `moveNote` `decideNote` `undecideNote` `hideLane` `addCustomLane` `removeCustomLane` `expire`。
  `expire` は過ぎた休みを片づける（決定済みは「行った旅」へ、未決定は壁へ戻す）。
- `formatRange`, `laneTitle`, `decidedText`（コピー用の文面）。

## 検品
- node --test でロジック。design-refine の preview.py で 1280 / 390 幅・スクロール前後、contrast.py と lint.sh を clean にする。
