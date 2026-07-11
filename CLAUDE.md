# 合戦ズ ― CLAUDE.md

## プロジェクト概要

長久手市文化の家『合戦ズ』（作: 麻原奈未）を原作にした歴史空想RPG。
Vanilla JS + HTML5 Canvas、ビルド不要、`file://` でも動作。

## アセット管理ルール

ユーザーが `assets/` に画像を入れたと報告したら、以下を行うこと：

1. **リネーム**: 日本語や空白を含むファイル名を英数字スネークケースに変更（例: `ChatGPT Image 2026年6月17日.png` → `title_logo.png`）
2. **適切なサブフォルダに配置**: 用途に応じて以下のフォルダに移動する
   - `assets/tiles/` — 地面のシームレステクスチャ（grass / road / dirt / water）
   - `assets/deco/` — 木・茂み・岩・塚などの装飾スプライト（透過）
   - `assets/buildings/` — 建物の一枚絵（透過・下寄せ）
   - `assets/sprites/` — 歩行・走行スプライトシート（`<kind>_walk.png` / `<kind>_run.png`・各3列×4行）
   - `assets/face/` — 顔ウィンドウ用の立ち絵・バスト画像（`<kind>.png`）
   - `assets/enemy/` — 敵キャラのバトル画像・スプライト
   - `assets/logo/` — ロゴ、タイトル画像
   - 該当フォルダがなければ新規作成（例: `assets/chara/` 等）
3. **所定のファイル名なら自動反映**: tiles / deco / buildings / sprites / face は game.js が決まった名前を自動で読む（一覧と状態は `docs/ASSETS.md`）。それ以外は既存パターン（IIFE + `new Image()`）に倣ってローダーに登録する
4. **解像度を下げない**: 画像の加工（透過処理・トリミング等）を行う際、元画像の解像度・画質を維持すること。リサイズや圧縮はしない。表示サイズの調整は Canvas の `drawImage` 側で行う。ただし、高解像度画像が多数になり読み込みやレンダリングに影響が出そうな場合はユーザーに相談すること

## ファイル構成

- `prototype/index.html` — ゲーム本体のHTML（キャッシュバスター `?v=` はコード変更時に更新する。読み込み順: dialogue.js → maps.js → game.js）
- `prototype/game.js` — ゲームロジック（Canvas描画・シーン管理・戦闘・ミニゲーム等。内部解像度は2倍で描画）
- `prototype/maps.js` — マップデータ専用ファイル（タイル行列・MAP_DEFS・HD_DECO_DEF/HD_BLD_DEF・リニモ定義 LINIMO_STATIONS/LINIMO_TRACK）
- `prototype/dialogue.js` — 全セリフデータ（DIALOGUE オブジェクト。**新キーは必ずトップレベルに追加**——localStorage のマージがトップレベルキー単位のため）
- `prototype/editor.html` — ブラウザ上のセリフエディター（新しいセリフキーは SECTIONS / SCENE_LABELS に登録する）
- `prototype/test.html` — テスター用シーンセレクト（本編からはリンクしない。セーブは自動退避される）
- `prototype/style.css` — UI スタイル
- `prototype/assets/` — 画像アセット（差し替え一覧は `docs/ASSETS.md`）
- `docs/DESIGN.md` — 拡張版の設計書・原作シーン台帳
- `docs/ASSETS.md` — アセット差し替え一覧（導入状態つき）
- `docs/asset_prompts.md` — ChatGPT用の画像生成プロンプト集（第1〜4弾）

## 実装メモ

- フィールドの走行は**方向入力中にB**（通常速度の1.6倍・スタミナ消費なし）。停止中のB短押しとXはメニュー。イベント・カットシーン中は走行入力を受け付けない
- セーブは2ファイル制（`kassenzu_save_v2_f1` / `_f2`）。セーブポイントと「つづきから」でファイルを選ぶ。旧単一セーブは初回起動時にファイル1へ自動移行
- 戦闘は複数敵対応（`startBattle({ enemies: [...] })`）。従来の `enemy:` 指定も1体として動く
- マップ行は全行同じ幅であること（検証スクリプトの前例: `/tmp/claude/checkmaps.py` 方式で幅チェック）
- 街の配置は実際の長久手市に準拠（方角込み）。ゾーン接続は `H—F / H—C / F—A / C—A / C—D / A—B / D—B / E—G—F / I—G`（すべて双方向）。zoneI（平成こども塾）はzoneGの西にある行き止まり。zoneA は画面上=芸大通、下=杁ヶ池公園、左=市役所方面とし、イオンは記念館の上側、間に東西道路、右側に縦方向のリニモと長久手古戦場駅を置く
- ストーリーイベントは zoneA の記念館前広場に依存する。基準座標は `game.js` の `ZA_POS` に集約し、会話中の人物が下部ウィンドウと重ならないよう広場南側に十分なカメラ余白を残す。**zoneA のレイアウト変更時は ZA_POS / walkTo / 施設出口 / テスター開始座標との整合を必ず確認**
- 敵は maps.js の `ENEMY_DEFS`（10種＋レア2種）と `ENCOUNTER_TABLES`（ゾーン別・重み付き）がデータ源。街ゾーンのエンカウントは `afterUnlock: true`（街解放後のみ）。バトル絵は `assets/enemy/<kind>_battle.png` 自動読込
- モブNPCは maps.js の `MOB_DEFS`。フェーズ（quest=取材中 / night=決戦前夜 / post=クリア後）ごとに位置・人数が変わり、セリフは dialogue.js の `mob_<id>_<フェーズ>`（無ければ _quest にフォールバック）
- 施設内部マップは `<施設>_in`（イオン・一蘭・市役所・図書館・胡牀庵・丸太の家・岩崎城記念館・天守展望室）＋駅ホーム `station_home`（全駅共通・現在駅は game.js の stationAt）。買い物・ミニゲームは店内の店員に話しかけて発動
- リニモの駅順は `fujigaoka → hanamizuki → iriga → kosenjo → geidai → koennishi → expo → yakusa`。藤が丘と八草はホームのみで外へ出られない。現地取材開始前は駅構内にも入れず、上下ホームは「藤が丘方面」と「八草方面」に分ける
- みやぶる: もののけ系（MONSTER_KINDS）は見破るまでオダの攻撃が通らない。必要Lvは `ENEMY_DEFS.miyaLv`（ハードのみ判定・イージーはLv1で全敵OK）。みやぶるLvはオダLv連動（10でLv2・18でLv3）。格上のいる戦闘と通常エンカウント（canFlee）は「にげる」必成功。四章開始時にチュートリアルバトルあり。図書館謎解き初回クリアで「もののけ図録」（mgDone.zuroku・みやぶるに由来解説が付く）
- クイズは全系統（検定・史跡・合いの手・岩崎ゲート）で `shuffleQuiz()` により選択肢シャッフル。長久手検定は20問データ（`mania: true` はハード限定）から イージー5問3択／ハード10問4択（6問未満でGO）
- 色金山は2フロアダンジョン `irogane1`（登山道・エンカウントあり）→`irogane2`（山頂: 床机石=site_irogane・展望台・篝火）。zoneH の R が登山口。展望台の写真は `assets/view/irogane_view.png` を置くと自動で実写表示（それまではテキストの眺望）
- 文化の家は全館内マップ: 廊下 `bunka1`（1階・20×14）/`bunka2`（2階・24×14・アーツライブラリー併設）/`bunka3`（3階）＋個別部屋 `bk_*` 14室（公式サイト bunkanoie.jp/rental の設備準拠）。部屋の出口座標は game.js の `BK_RETURN`、初入場ナレは `BUNKA_ENTER`（enteredFlavor で1回）
- 光のホール（bk_hikari）の黒野に話しかけると本編（YouTube）を `showVideoOverlay()` で #stage 上に16:9オーバーレイ再生（✕で閉じる・再生中は videoOverlay フラグで scene.update 停止）。黒野は実在職員の想定——セリフ・扱いは本人了承前提
- 効果音は Web Audio の合成音（`playTone`/`playPianoArp`・音声ファイル不要）。ドラムサークルはリズム復唱式（listen→play・タイミング±35%判定・ハードは矢印太鼓＋ミス3回でGO）
- アーツライブラリーの本は dialogue.js の `arts_book1〜4`（1行目=タイトル・以降1行=1ページ。エディターで編集可）
- Bash ヒアドキュメント内の `!` は破損するため、`!` を含むスクリプトはファイルに書いてから実行する

## 公開先

- ゲーム: https://mune720.github.io/kassenzu/prototype/
- エディター: https://mune720.github.io/kassenzu/prototype/editor.html
- リポジトリ: https://github.com/mune720/kassenzu
