# 報告革命 LP デザインQA

- 実施日: 2026-09-05 JST
- source visual truth: /Users/shoteshigahara/.codex/generated_images/01a06e79-1c41-7291-9727-e635c782118a/exec-162e4747-73d4-4951-bbc4-985399abf4c8.png
- implementation: http://127.0.0.1:4173/
- source pixels: 864 × 1821（デスクトップ構成の生成モック）
- viewport: desktop 1280 × 900 / mobile 390 × 844 CSS px
- capture density: 1 pixel per CSS px。比較画像では1280px幅を864pxに縮小。
- state: フォント・画像読み込み完了、会話登場後。全体比較時はUIの「動きを止める」で静止。
- final result: passed

## 比較証跡

- 全体: /private/tmp/hokoku-lp-qa/full-comparison.png
- ヒーローの同時比較: /private/tmp/hokoku-lp-qa/hero-comparison.png
- PC最終画面: /private/tmp/hokoku-lp-qa/desktop-final.png
- 各章: /private/tmp/hokoku-lp-qa/chapter-one.png, chapter-two.png, chapter-three.png
- 料金/CTA: /private/tmp/hokoku-lp-qa/price-cta.png
- スマホ: /private/tmp/hokoku-lp-qa/mobile-final.png
- スマホ見出し修正後: /private/tmp/hokoku-lp-qa/mobile-feature-final.png

全体比較は同じブラウザの通常キャプチャをスクロール位置に合わせて配置。デスクトップの固定追従するフォーム説明はスクロール位置ごとに移動するため、単独セクションの画面でも確認した。全ページキャプチャの結合不具合を実装のレイアウト不具合とは扱わない。

## 比較履歴と修正

1. [P2 / typography] 初稿はヒーローの主コピー、会話、本文の表示がモックより小さい。PC見出しを約76px、本文/会話を18pxへ調整。金メダルを生成画像に置換し125px表示。hero-comparison.pngで再比較し解消。
2. [P2 / readability] スマホ本文、実績補足、採用ラベルが小さい。本文14px、実績補足11px、時点/採用ラベル10px以上へ調整。mobile-final.pngで解消。
3. [P2 / wrapping] スマホ章01の「ありがとう。」末尾2文字が孤立。文節単位のspanで折返しを調整。mobile-feature-final.pngで自然な3行を確認、解消。

## 必須の5観点

- Typography: Noto Serif JPの見出し、Noto Sans JPの本文を読み込み確認。スマホの不自然な孤立行を修正。見出しはH1が1つ、各章H2。
- Spacing/layout: 左コピー・右会話、濃緑の変化説明、交互配置の3章、料金・CTAを維持。タッチ操作44px以上。320/390/768/1024/1280/1440pxで横はみ出しなし。
- Colors/tokens: 深緑・生成り・ミント・金色を維持。本文と背景、ボタンと文字、フォーカスリングを視認確認。
- Images: 淡彩の人物3点、透明背景の金メダル、清掃用具ボード、OG画像を生成・目視確認。標準アイコンはPhosphor素材。画像欠落なし。
- Copy/content: 「報告→会話/称賛→改善→共有」を維持。4社/47アカウント/1社5〜22名はユーザー確認済み情報。2026年9月時点と記載。会話/画面は利用イメージ。550円/月・税込、人数別計算、構造化データ一致。

## 意図した差分

- ユーザー追加指示の導入実績とモーションを追加。
- 既存の無料デモ申込フォームと個人情報の利用目的を維持し、新デザインへ組み込んだ。
- 可読性と入力操作のため、生成モックよりページの縦余白を確保。
- ヒーローの流れは会話の順次登場で表現。背景は生成りの単色とし、長時間動き続ける演出は設けない。

## 機能検証

- CTAから#demo-formへの移動、料金/使い方案内への移動、FAQ開閉。
- 空の必須項目・不正メール・人数0をブラウザが拒否。
- ローカル静的サーバーの意図的な送信失敗で日本語エラー、入力保持、ボタン再有効化。
- 動きの停止/再開とaria-pressed、reduced-motion/IntersectionObserver非対応時の表示は単体テストでも確認。
- フォーム可視中はスマホ固定CTAが入力を覆わない。フォーカス中のCTAは消さない。
- node --check script.js / api/demo.js、node --test tests/*.test.cjs: 35件成功。
- リンク/ID/ローカル画像/JSON-LDの整合確認。git diff --check成功。
- ブラウザconsole: 初期ロードのエラーなし。意図的なローカルPOST失敗のHTTPエラーのみ検証時に発生。

## 残る検証範囲

実際のGoogle Formへのテスト申込は送信していない。既存APIの送信先を維持し、上流fetchをstubした契約テストで確認した。公開後は本番URL、画像/CSS/JS、CTA、APIの非送信GET応答を確認する。

未解決のP0/P1/P2なし。追加SQL・手動設定なし。

## 漫画のLP内掲載（2026年9月5日・日本時間）

構成：ヒーロー → 導入実績 → 漫画4スライド（各2コマ） → 報告から共有への流れ → 既存の機能説明・料金・無料デモ。承認済みの漫画を使用し、冒頭の見出しは「現場は回る、でも声が埋もれる」。PCは2コマを横並び、幅540px以下は2コマを縦積みにして文字を読みやすくする。登場人物・会話は架空とHTMLでも注記する。

| 境界 | 処理 |
| --- | --- |
| 導入実績 → 漫画 | LPの生成りから漫画の紙色へ淡い背景グラデーションで接続。見出しと本文の余白を確保 |
| 漫画1 → 漫画4 | 2コマごとに進む。前後ボタンと進行ドットを置き、標準設定では6.5秒ごとに次の2コマへ進む。操作・ホバー・キーボードフォーカス・動きを止める設定では自動切替を止める |
| 漫画 → 流れの説明 | 紙色からLPの生成りへ戻す。下部に既存デモへのリンクを置く |

モーションは見出し・スライド本体で既存のスクロール表示を再利用。最初の2コマは優先表示し、残りの6コマは遅延読み込みにする。コマは元の漫画から切り出したJPEG8枚で、表示時の文字サイズを保つ。

検証済み：既存35テスト成功（上流送信stub、実送信なし）。JavaScript・API・フォーム項目・送信先の変更なし。
