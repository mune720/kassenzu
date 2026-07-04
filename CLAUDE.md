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
   - `assets/sprites/` — 歩行スプライトシート（`<kind>_walk.png`・3列×4行）
   - `assets/face/` — 顔ウィンドウ用の立ち絵・バスト画像（`<kind>.png`）
   - `assets/enemy/` — 敵キャラのバトル画像・スプライト
   - `assets/logo/` — ロゴ、タイトル画像
   - 該当フォルダがなければ新規作成（例: `assets/chara/` 等）
3. **所定のファイル名なら自動反映**: tiles / deco / buildings / sprites / face は game.js が決まった名前を自動で読む（一覧と状態は `docs/ASSETS.md`）。それ以外は既存パターン（IIFE + `new Image()`）に倣ってローダーに登録する
4. **解像度を下げない**: 画像の加工（透過処理・トリミング等）を行う際、元画像の解像度・画質を維持すること。リサイズや圧縮はしない。表示サイズの調整は Canvas の `drawImage` 側で行う。ただし、高解像度画像が多数になり読み込みやレンダリングに影響が出そうな場合はユーザーに相談すること

## ファイル構成

- `prototype/index.html` — ゲーム本体のHTML（キャッシュバスター `?v=` はコード変更時に更新する）
- `prototype/game.js` — ゲームロジック（Canvas描画・シーン管理・戦闘・ミニゲーム等。内部解像度は2倍で描画）
- `prototype/dialogue.js` — 全セリフデータ（DIALOGUE オブジェクト。**新キーは必ずトップレベルに追加**——localStorage のマージがトップレベルキー単位のため）
- `prototype/editor.html` — ブラウザ上のセリフエディター（新しいセリフキーは SECTIONS / SCENE_LABELS に登録する）
- `prototype/test.html` — テスター用シーンセレクト（本編からはリンクしない。セーブは自動退避される）
- `prototype/style.css` — UI スタイル
- `prototype/assets/` — 画像アセット（差し替え一覧は `docs/ASSETS.md`）
- `docs/DESIGN.md` — 拡張版の設計書・原作シーン台帳
- `docs/ASSETS.md` — アセット差し替え一覧（導入状態つき）
- `docs/asset_prompts.md` — ChatGPT用の画像生成プロンプト集（第1〜3弾）

## 実装メモ

- セーブは2ファイル制（`kassenzu_save_v2_f1` / `_f2`）。セーブポイントと「つづきから」でファイルを選ぶ。旧単一セーブは初回起動時にファイル1へ自動移行
- 戦闘は複数敵対応（`startBattle({ enemies: [...] })`）。従来の `enemy:` 指定も1体として動く
- マップ行は全行同じ幅であること（検証スクリプトの前例: `/tmp/claude/checkmaps.py` 方式で幅チェック）
- Bash ヒアドキュメント内の `!` は破損するため、`!` を含むスクリプトはファイルに書いてから実行する

## 公開先

- ゲーム: https://mune720.github.io/kassenzu/prototype/
- エディター: https://mune720.github.io/kassenzu/prototype/editor.html
- リポジトリ: https://github.com/mune720/kassenzu
