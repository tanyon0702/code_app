# Self Evolution Desk

`Tauri + React + Python(FastAPI)` の構成です。

## 構成

- `backend_app.py`: Python API とストリーミングチャット
- `llama_client.py`: `llama-server` 常駐管理
- `frontend/`: React + Vite UI
- `frontend/src-tauri/`: Tauri ラッパー

## 開発手順

### ワンクリック起動

ルートの `start_app.bat` をダブルクリックすると、バックエンドとフロントエンドをまとめて起動してブラウザを開きます。

初回は `frontend\node_modules` が必要なので、まだなら一度だけ以下を実行してください。

```powershell
cd "c:\Users\Tanyo\Desktop\Self-evolution game\frontend"
npm install
```

1. Python API を起動

```powershell
cd "c:\Users\Tanyo\Desktop\Self-evolution game"
python -m uvicorn backend_app:app --reload --port 8001
```

2. フロントエンド依存を入れる

```powershell
cd "c:\Users\Tanyo\Desktop\Self-evolution game\frontend"
npm install
```

3. React UI を起動

```powershell
npm run dev
```

4. Tauri を使う場合

Rust と Cargo を入れたあとで:

```powershell
cd "c:\Users\Tanyo\Desktop\Self-evolution game\frontend"
npm install
npm run tauri:dev
```

## 注意

- 現在の環境では `cargo` が未導入なので、Tauri 本体の実行はまだできません。
- Python API は `http://127.0.0.1:8001` を前提にしています。
- ノートは `data/notes/main.md` に自動保存されます。
