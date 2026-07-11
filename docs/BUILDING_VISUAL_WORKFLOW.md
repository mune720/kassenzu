# 実在建物・HD-2D外観制作手順

文化の家で確立した方法を、トヨタ博物館・愛知県立芸術大学・IKEA長久手・愛知医科大学病院などへ展開するための基準。

## 共通仕様

- 主参照は正面写真。斜め・俯瞰写真は屋根、側面、棟のつながりを補うために使う。
- 形を創作せず、入口、窓割り、屋根、塔、庇、外壁素材など、遠目で施設を識別できる特徴を優先する。
- 画風は、写実写真と単純なピクセルアイコンの中間にある手描きHD-2D環境アート。
- 家族向けだが幼くしすぎず、建築の重さと素材感を残す。
- 原則1536×1024 RGBA。生成時の解像度を維持し、リサイズ・再圧縮しない。
- 玄関はゲーム内の入口タイルに合うよう水平中央へ置く。
- 建物は前庭・旗竿を含め横幅の約90〜100%を使い、上部に透明余白、alpha実画素の下端は最下端から0〜12pxへ接地する。
- 建物の直下には最低限の舗装・芝・低木だけを残す。空、遠景、人物、車、文字、ロゴ、独自の影は含めない。
- 背景は均一な `#ff00ff` クロマキーにし、生成後に透過する。

## 参照画像の役割

プロンプト内で必ず役割を明記する。

```text
Image 1 = primary frontal reference for facade, entrance, proportions and viewpoint.
Image 2 = supporting reference for roof masses, side volumes and overall complex.
Official sources = verification of materials, history and identifying architectural details.
```

## 共通生成プロンプト

```text
Use case: stylized-concept
Asset type: 1536x1024 transparent-background building sprite for an HD-2D Japanese RPG.
Primary request: Create a faithful, front-facing illustrated game asset of <施設名>,
using Image 1 as the primary frontal architectural reference and Image 2 only as
a supporting reference for roof masses and overall layout.
Scene/backdrop: Place the entire opaque building and only a minimal strip of forecourt
paving, grass and low clipped shrubs on a perfectly flat solid #ff00ff chroma-key
background. No sky, city, horizon, distant landscape or floor plane.
Subject: Preserve <識別に必要な屋根、入口、窓、塔、庇、外壁、差し色>.
Style/medium: polished hand-painted HD-2D environment art with subtle pixel-art edge
discipline and simplified mid-frequency texture. Believable architecture; family-accessible,
not childish. Not photorealistic, not a flat vector icon, not a glossy 3D render.
Composition/framing: near-straight-on front elevation with only a slight elevated
perspective. Center the main entrance horizontally. Span about 90% of the canvas width.
Keep the complete roofline inside the canvas. Ground the alpha subject within 0-12px
of the bottom edge after post-processing.
Lighting/mood: clear bright daytime, soft warm light from upper left, gentle shadows
and ambient occlusion within the building only.
Constraints: fully opaque crisp subject edges; no cast shadow outside the subject;
no people, cars, bicycles, signs, text, lettering, logos or watermark. The #ff00ff
background must be one uniform color and must not appear in the subject.
Avoid: aerial view, strong three-quarter view, generic replacement architecture,
distorted perspective, invented signage, floating building, cropped roof, excess vegetation.
```

## 文化の家で使用した最終指定

- 正面写真: 正面ファサード、入口、窓割り、左右棟の比率
- 俯瞰写真: 連続屋根、ホール棟、舞台塔、敷地構成
- 必須要素: 灰色の連続マンサード型屋根、中央の縦長ガラス入口、淡い石色の左棟、水平窓と濃い格子庇の右棟、銀灰色の縦リブ舞台塔、頂部の櫛形飾り、右端の旗竿、控えめな朱赤の差し色
- 素材: 打放しコンクリート、縦リブ金属板、淡い石、濃灰緑の金属庇、青灰色ガラス
- 雰囲気: 堂々としているが周囲の緑になじみ、市民の「家」として親しみがある

## 透過処理

```bash
python "$HOME/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input <生成画像.png> \
  --out <透過画像.png> \
  --key-color '#ff00ff' \
  --soft-matte \
  --transparent-threshold 55 \
  --opaque-threshold 150 \
  --despill \
  --force
```

## 底辺接地

生成画像に下側の透明余白が残った場合、画素を拡大縮小せず縦方向だけ移動する。

```bash
python scripts/anchor_transparent_asset.py \
  <透過画像.png> \
  prototype/assets/buildings/<key>.png \
  --bottom-pad 8
```

## 検証

- 画像寸法とRGBAを確認する
- 四隅が完全透過している
- 外壁や窓に透明穴がない
- マゼンタの輪郭が残っていない
- 建物が地面の影から浮いていない
- 玄関が入口タイルと一致する
- 屋根や塔が画面上端で切れない
- プレイヤーが建物前に正しく描画される
- 512×448のゲーム画面で施設を識別できる
- 同名画像を更新した場合は画像URLにもキャッシュバスターを付ける

## 文化の家の一次資料

- [長久手市文化の家・ABOUT](https://bunkanoie.jp/about)
- [長久手市文化の家・ACCESS](https://bunkanoie.jp/about/access)
- [香山建築研究所・長久手町文化の家](https://kohyama-a.co.jp/ja/works/nagakute-cultural-center/)
- [愛知県・長久手市景観資源リスト](https://www.pref.aichi.jp/soshiki/koen/keikanshigen-nagakute.html)
- [愛知県・第8回愛知まちなみ建築賞](https://www.pref.aichi.jp/soshiki/koen/machiken8.html)
- [文化の家・刊行物／情報誌](https://bunkanoie.jp/archives/category/publications/information-magazine)
