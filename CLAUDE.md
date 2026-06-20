# 合戦ズ ― CLAUDE.md

## プロジェクト概要

長久手市文化の家『合戦ズ』（作: 麻原奈未）を原作にした歴史空想RPG。
Vanilla JS + HTML5 Canvas、ビルド不要、`file://` でも動作。

## アセット管理ルール

ユーザーが `assets/` に画像を入れたと報告したら、以下を行うこと：

1. **リネーム**: 日本語や空白を含むファイル名を英数字スネークケースに変更（例: `ChatGPT Image 2026年6月17日.png` → `title_logo.png`）
2. **適切なサブフォルダに配置**: 用途に応じて以下のフォルダに移動する
   - `assets/logo/` — ロゴ、タイトル画像
   - `assets/enemy/` — 敵キャラのバトル画像・スプライト
   - `assets/face/` — 顔ウィンドウ用の立ち絵・バスト画像
   - 該当フォルダがなければ新規作成（例: `assets/bg/` 等）
3. **game.js のローダーに登録**: 既存パターン（IIFE + `new Image()`）に倣って画像をプリロードする
4. **解像度を下げない**: 画像の加工（透過処理・トリミング等）を行う際、元画像の解像度・画質を維持すること。リサイズや圧縮はしない。表示サイズの調整は Canvas の `drawImage` 側で行う。ただし、高解像度画像が多数になり読み込みやレンダリングに影響が出そうな場合はユーザーに相談すること

## ファイル構成

- `prototype/index.html` — ゲーム本体のHTML
- `prototype/game.js` — ゲームロジック（Canvas描画・シーン管理・戦闘等）
- `prototype/dialogue.js` — 全セリフデータ（DIALOGUE オブジェクト）
- `prototype/editor.html` — ブラウザ上のセリフエディター
- `prototype/style.css` — UI スタイル
- `prototype/assets/` — 画像アセット

## 公開先

- ゲーム: https://mune720.github.io/kassenzu/prototype/
- エディター: https://mune720.github.io/kassenzu/prototype/editor.html
- リポジトリ: https://github.com/mune720/kassenzu
