# 業務記録システム（訪問診療）

GAS版から移植した、訪問診療の業務時間記録アプリです。

## 機能

- **設定** — スタッフ名・職種・勤務場所の登録
- **記録** — 音声入力（キーボードマイク）→ Claude API で自然言語解析 → 打刻保存
- **集計** — 患者別の移動・準備・診療時間（時刻差分で機械計算）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数

`.env` ファイルを編集：

```
DATABASE_URL="file:./dev.db"
CLAUDE_API_KEY="sk-ant-..."   # Anthropic API キー
```

### 3. データベース初期化

```bash
npm run db:push
```

### 4. 施設マスタ（任意）

開発中は API または Prisma Studio で施設を登録できます：

```bash
npm run db:studio
```

`Facility` テーブルに施設名を追加（GAS の「施設マスタ」シート相当）。

### 5. 開発サーバー起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く。

スマホから試す場合は同一 Wi-Fi 内で `http://<PCのIP>:3000` にアクセス。

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
    db.ts             # Prisma
gas/                  # 旧GASコード（参考用）
```

## GAS版との違い

| 項目 | GAS版 | このアプリ |
|------|-------|-----------|
| ホスティング | Google Apps Script | Next.js（Vercel等） |
| データ保存 | スプレッドシート | SQLite（本番はPostgreSQL可） |
| 認証 | Googleアカウント | 端末ローカル（将来OAuth追加可） |
| 集計 | AI推測（不安定） | 時刻差分計算（安定） |

## 記録のコツ

1患者の診療サイクルは **出発 → 到着 → 開始 → 終了** が理想です。

## 次のステップ

- [ ] 施設別集計タブ
- [ ] Google OAuth ログイン
- [ ] PWA化（ホーム画面追加）
- [ ] Vercel デプロイ
- [ ] スプレッドシートからのデータ移行
