# 業務記録システム（訪問診療）

GAS版から移植した、訪問診療の業務時間記録アプリです。

## 機能

- **設定** — スタッフ名・職種・勤務場所の登録
- **記録** — 音声入力（キーボードマイク）→ Claude API で自然言語解析 → 打刻保存
- **集計** — 患者別・施設別の移動・準備・診療時間
- **Google Sheets 連携** — PIDのみをリアルタイム書き込み（秘書共有用）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数

`.env.local` に設定（Neon 等の DB は **不要**）：

```
CLAUDE_API_KEY="sk-ant-..."
GOOGLE_SHEETS_SPREADSHEET_ID=...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY="..."
```

詳細 → [docs/deploy-vercel.md](docs/deploy-vercel.md)

### 3. 施設マスタ

スプレッドシートの **「施設マスタ」** タブに施設名を登録するか、API で追加：

```bash
curl -X POST http://localhost:3000/api/facilities \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"ひまわりケアセンター\"}"
```

### 4. 開発サーバー起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く。

スマホから試す場合は同一 Wi-Fi 内で `http://<PCのIP>:3000` にアクセス。

### 5. Google Sheets（記録の保存先・必須）

記録・集計・施設マスタは **すべてスプレッドシート** に保存します（Neon 等の DB は不要）。

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. **Google Sheets API** を有効化
3. **サービスアカウント** を作成 → JSON キーをダウンロード
4. 共有用スプレッドシートを作成 → サービスアカウントのメールを **編集者** で共有
5. `.env` に設定：

```
GOOGLE_SHEETS_SPREADSHEET_ID=スプレッドシートURLのID部分
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

6. 接続確認：`http://localhost:3000/api/sheets/health`

秘書向け VLOOKUP 手順 → [docs/secretary-vlookup.md](docs/secretary-vlookup.md)

## プロジェクト構成

```
src/
  app/
    page.tsx          # メイン画面
    api/
      setup/          # スタッフ登録
      record/         # 記録・解析
      summary/        # 集計取得
      login/          # ログイン確認
      facilities/     # 施設マスタ
  components/
    AppShell.tsx      # UI（GAS index.html 移植）
  lib/
    claude.ts         # AI自然言語解析
    summary.ts        # 決定論的集計
    hash.ts           # PID匿名化
    sheets.ts         # Google Sheets 書き込み
    db.ts             # Prisma
docs/
  secretary-vlookup.md  # 秘書向け手順
gas/                  # 旧GASコード（参考用）
```

## GAS版との違い

| 項目 | GAS版 | このアプリ |
|------|-------|-----------|
| ホスティング | Google Apps Script | Next.js（Vercel等） |
| データ保存 | スプレッドシート | Google Sheets（記録・集計・施設マスタ） |
| 認証 | Googleアカウント | 端末ローカル（将来OAuth追加可） |
| 集計 | AI推測（不安定） | 時刻差分計算（安定） |

## 記録のコツ

1患者の診療サイクルは **出発 → 到着 → 開始 → 終了** が理想です。

## 次のステップ

- [x] 施設別集計タブ
- [x] Google Sheets 連携（記録・集計・施設マスタ）
- [x] Vercel デプロイ（DB 不要・Web URL）
