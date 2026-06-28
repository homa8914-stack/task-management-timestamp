# Vercel デプロイ手順（Web URL・Neon 不要）

スマホのブラウザ → **https://あなたのアプリ.vercel.app** → 記録 → Google Sheets

**データベース（Neon）は不要**です。記録はすべて Google スプレッドシートに保存されます。

---

## 必要なもの

| 項目 | 用途 |
|------|------|
| GitHub リポジトリ | Vercel がコードを取得 |
| Anthropic API キー | 音声テキストの解析 |
| Google スプレッドシート | **記録の保存先**（秘書も同じシートを閲覧） |

---

## ステップ 1：Vercel にデプロイ

1. https://vercel.com → **Add New → Project**
2. `homa8914-stack/task-management-timestamp` を Import
3. **Environment Variables** に追加：

| 名前 | 値 |
|------|-----|
| `CLAUDE_API_KEY` | Anthropic API キー |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | 共有スプレッドシート ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | サービスアカウント |
| `GOOGLE_PRIVATE_KEY` | 秘密鍵（改行は `\n`） |

4. **Deploy**

`DATABASE_URL` は **設定不要** です。

---

## ステップ 2：動作確認

```
https://あなたのプロジェクト.vercel.app/api/health
https://あなたのプロジェクト.vercel.app/api/sheets/health
```

`sheetsConfigured: true` になれば OK。

---

## ステップ 3：施設マスタ

スプレッドシートに **「施設マスタ」** タブを作り、A1 に `施設名`、A2 以降に施設名を入力。

または API / curl：

```bash
curl -X POST https://あなたのプロジェクト.vercel.app/api/facilities \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"ひまわりケアセンター\"}"
```

---

## ステップ 4：スマホで使う

1. Safari でデプロイ URL を開く
2. **設定** → スタッフ名・職種・勤務場所を登録（端末に保存）
3. **共有 → ホーム画面に追加**
4. **記録** → 入力欄タップ → キーボードの **マイク** で話す

---

## データの保存場所

| データ | 保存先 |
|--------|--------|
| 打刻ログ | スプレッドシート「記録」 |
| 集計 | 「集計_施設」「施設別_履歴」など |
| 施設名リスト | 「施設マスタ」 |
| スタッフ設定 | **スマホのブラウザ内**（localStorage） |
| 患者名（使う場合） | **スマホのみ** |

---

## 秘書さん

**スプレッドシートの閲覧リンク** だけ渡せば OK（今の施設名だけ運用なら患者マスタ不要）。

---

## ローカル開発

`.env.local` に Claude + Google Sheets の設定を書いて：

```bash
npm install
npm run dev
```

PC も本番と同じスプレッドシートを使えます。

---

## 困ったとき

| 症状 | 対処 |
|------|------|
| 記録できない / Sheets エラー | `/api/sheets/health` を確認 |
| 施設が「不明」 | 施設マスタに名称を追加 |
| 設定が消えた | ブラウザのデータ削除が原因。同じ URL から開く |
| ビルド失敗 | `DATABASE_URL` は不要。Sheets 変数だけ確認 |
