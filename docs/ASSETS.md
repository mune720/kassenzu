# アセット差し替え一覧（ASSETS.md）

ゲームが読み込む画像・音の一覧と、現在の状態。**ファイル名さえ合っていれば、`prototype/assets/` に置くだけで自動で反映される**（コード変更不要）。生成プロンプトは [asset_prompts.md](asset_prompts.md)、実在建物は [BUILDING_VISUAL_WORKFLOW.md](BUILDING_VISUAL_WORKFLOW.md)、主要人物は [CHARACTER_VISUAL_WORKFLOW.md](CHARACTER_VISUAL_WORKFLOW.md) を参照。

凡例: ✅=導入済み　⬜=未導入（無くてもプロシージャル描画やプレースホルダーで動作）　🔊=音（未実装）

---

## 1. 地面テクスチャ　`assets/tiles/`（1024×1024・シームレス）

| ファイル | 用途 | 状態 |
|---|---|---|
| `grass.png` | 草地（全屋外＋戦闘の下地） | ✅ |
| `road.png` | アスファルト道路（県道・グリーンロード） | ✅ |
| `dirt.png` | 土の参道 | ✅ |
| `water.png` | 池の水面（波アニメを上に合成） | ✅ |

## 2. 装飾スプライト　`assets/deco/`（透過・底辺接地）

| ファイル | 用途 | 状態 |
|---|---|---|
| `tree.png` | 木（クスノキ風） | ✅ |
| `bush.png` | 茂み | ✅ |
| `rock.png` | 岩 | ✅ |
| `mound.png` | 勝入塚 | ✅ |
| `mound_s.png` | 庄九郎塚 | ✅ |

## 3. 建物一枚絵　`assets/buildings/`（透過・下寄せ）

| ファイル | 用途 | 状態 |
|---|---|---|
| `museum.png` | 古戦場公園の記念館 | ✅ |
| `aeon.png` | イオンモール長久手 | ✅ |
| `station.png` | リニモ古戦場駅 | ✅ |
| `ramen.png` | 一蘭 砂子交差点店 | ✅ |
| `tearoom.png` | 色金山ふもとの茶室 | ✅ |
| `cityhall.png` | 長久手市役所 | ✅ |
| `kodomo.png` | 平成こども塾 丸太の家 | ✅ |
| `temple.png` | 安昌寺 | ✅ |
| `bunka.png` | 文化の家 | ✅ 正面写真・公式資料準拠のHD-2D版（入口中央・底辺接地補正済み） |
| `library.png` | 中央図書館 | ✅ |
| `ferris.png` | モリコロパーク 観覧車 | ✅ |
| `iwasaki_tenshu.png` | **岩崎城 模擬天守** | ⬜ 未導入（プロンプト E-1） |
| `iwasaki_kinenkan.png` | **岩崎城歴史記念館** | ⬜ 未導入（プロンプト E-2） |
| `toyota.png` | **トヨタ博物館**（芸大通・ゾーンF） | ⬜ 未導入（プロンプト F-1。未導入時は白壁のプロシージャル描画） |
| `geidai.png` | **愛知県立芸術大学**（ゾーンF北） | ⬜ 未導入（プロンプト F-2。同上） |
| `ikea.png` | **IKEA長久手**（公園西・ゾーンG） | ⬜ 未導入（プロンプト F-3。同上） |
| `aidai.png` | **愛知医科大学病院**（岩作・ゾーンC北東） | ⬜ 未導入（プロンプト F-4。同上） |

## 3b. 敵のバトル絵　`assets/enemy/`（透過・1024×1024・下寄せ）

置くと戦闘画面の敵がその絵に切り替わる（無い間は紫のもののけのコード描画）。プロンプトは第5弾（G-1〜G-11）。

| ファイル | 敵 | 出現ゾーン | 状態 |
|---|---|---|---|
| `ochimusha_mononoke_battle_512.png` | 落武者のもののけ（＋岩崎の落武者） | 全域・岩崎 | ✅ |
| `monomi_battle.png` | 物見のもののけ | 全域のお供 | ⬜ G-1 |
| `yako_battle.png` | 夜行のもののけ・夜行の影 | ハード見回り | ⬜ G-2 |
| `onibi_battle.png` | 鬼火の子 | ゾーンA・F | ⬜ G-3 |
| `chigaeru_battle.png` | 血の池がえる | ゾーンA・G | ⬜ G-4 |
| `mizuchi_battle.png` | 杁ヶ池のみずち | ゾーンB・G | ⬜ G-5 |
| `hatahira_battle.png` | 旗指しひらり | ゾーンB・D | ⬜ G-6 |
| `chagama_battle.png` | 茶がまだぬき | ゾーンC・D | ⬜ G-7 |
| `sabiyari_battle.png` | 錆槍の付喪神 | ゾーンC・F・岩崎 | ⬜ G-8 |
| `tagakashi_battle.png` | 田がかし武者 | ゾーンG・岩崎 | ⬜ G-9 |
| `koban_battle.png` | こばん狐（レア・金運） | 全域5% | ⬜ G-10 |
| `kabuto_battle.png` | 黄金の兜がね（レア・経験値） | 全域3% | ⬜ G-11 |

## 3c. 展望台の写真　`assets/view/`（実写・横長推奨）

| ファイル | 用途 | 状態 |
|---|---|---|
| `irogane_view.png` | 色金山・展望台から見た長久手の風景（置くと展望台で全画面表示。無い間はテキストの眺望） | ⬜ ユーザー撮影素材の受け渡し待ち |

## 4. 歩行スプライトシート　`assets/sprites/`（3列×4行）

置くとフィールドの歩行キャラが自動でこの画像に切り替わる（無ければコード描画のちびキャラ）。

| ファイル | キャラ | 状態 |
|---|---|---|
| `oda_walk.png` | オダ | ✅ 舞台衣装版（12コマの中心・足元を補正済み） |
| `kurono_walk.png` | 黒野（文化の家職員・光のホール） | ⬜ 写真ベース生成待ち（第3弾テンプレ・本人了承前提） |
| `ike_walk.png` | いけ（池田輝政） | ⬜ 写真ベース生成待ち |
| `michi_walk.png` | みち（森長可） | ⬜ 写真ベース生成待ち |
| `kancho_walk.png` | 館長 | ⬜ 写真ベース生成待ち |
| `odoriko_walk.png` | 踊り子（舞の演出以外はこれでちび表示） | ⬜ 写真ベース生成待ち |
| `sakamoto_walk.png` | 坂元さん | ⬜ 写真ベース生成待ち |
| `naiki_walk.png` | 内貴さん | ⬜ 写真ベース生成待ち |

## 5. 顔ウィンドウ（会話の立ち絵）　`assets/face/`（透過バストアップ）

置くだけで会話画面の顔が自動で切り替わる。
主要人物は `<kind>_neutral / serious / angry / happy.png` の4表情にも対応し、無い表情は `<kind>.png` へ戻る。

| ファイル | キャラ | 状態 |
|---|---|---|
| `odoriko.png` | 踊り子 | ✅ |
| `enemy.png` | もののけ | ✅ |
| `oda.png` | オダ（通常表情・互換用） | ✅ |
| `oda_neutral.png` | オダ（ニュートラル） | ✅ |
| `oda_serious.png` | オダ（少し困りつつ真剣） | ✅ |
| `oda_angry.png` | オダ（怒り・ツッコミ） | ✅ |
| `oda_happy.png` | オダ（笑顔） | ✅ |
| `ike.png` | いけ | ⬜ 写真ベース生成待ち |
| `michi.png` | みち | ⬜ 写真ベース生成待ち |
| `kancho.png` | 館長 | ⬜ 写真ベース生成待ち |
| `sakamoto.png` | 坂元さん | ⬜ 写真ベース生成待ち |
| `naiki.png` | 内貴さん | ⬜ 写真ベース生成待ち |

## 6. 戦闘の一枚絵　`assets/enemy/`（透過）

| ファイル | 用途 | 状態 |
|---|---|---|
| `odoriko_battle.png` | 踊り子（戦闘＋舞の演出） | ✅ |
| `ochimusha_mononoke_battle_*.png` | もののけ戦闘絵（各解像度） | ✅ |
| `odoriko_bust_transparent.png` / `odoriko_fullbody_transparent.png` | 踊り子 派生 | ✅ |

## 7. ロゴ　`assets/logo/`

| ファイル | 用途 | 状態 |
|---|---|---|
| `title_logo.png` | タイトルロゴ | ✅ |
| `bunkalogo.png` | 文化の家ロゴ | ✅ |

## 8. キャラの全身ベース絵　`assets/chara/`（タイトルロール・戦闘・カットシーン用）

タイトル画面で読み込み、上半身のキービジュアルとして表示する。第2弾プロンプトで生成。

| ファイル | キャラ | 状態 |
|---|---|---|
| `oda_full.png` | オダ | ✅ タイトル画面に接続済み |
| `ike_full.png` 〜 `naiki_full.png` | いけ・みち・館長・坂元・内貴 | ⬜ 未導入（踊り子は `enemy/odoriko_fullbody_transparent.png` を流用予定） |

## 9. 音（BGM・効果音）🔊

**未実装。** 差し込みポイントはコード内にコメントで用意済み（例: 追いかけっこの「待てー！」で太鼓SE）。導入時に読み込み層とトリガーを追加する。ユーザーから素材提供予定。

想定カテゴリ: タイトルBGM / フィールドBGM（昼・夜/異界）/ 戦闘BGM / ボス・第2形態BGM / 岩崎城BGM / ミニゲーム各種 / 決定・キャンセル・ダメージ・撃破・レベルアップ等のSE / 太鼓（ドラムサークル・待てー！）。

---

## 差し替え手順（共通）

1. 上表の**ファイル名どおり**に画像を用意（リサイズ・圧縮しない＝解像度を下げないルール）
2. `prototype/assets/` の該当フォルダに置く
3. ブラウザを Option+Cmd+R でハード再読み込み → 自動反映
4. コミット前に他ゾーンへの影響がないか通しで軽く確認

## 残タスク（素材まわり）

- **すぐできる（写真不要）**: 岩崎城の建物2点（`iwasaki_tenshu` / `iwasaki_kinenkan`）
- **写真＋本人了承が必要**: 残る主要キャラの face / walk / full（いけ・みち・館長・踊り子・坂元・内貴。オダは導入済み）
- **提供待ち**: BGM・効果音一式
