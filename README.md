# Code App

ローカル環境の `llama.cpp` を使って、コードに対する `Fix / Feedback / Explain` を行うデスクトップ寄りの開発支援ツールです。  
フロントエンドは `React + Vite`、バックエンドは `FastAPI`、モデル実行は `llama-server` を前提にしています。

## Features

- 単一ファイルに対する `Fix / Feedback / Explain`
- プロジェクト全体に対する `Project Fix / Feedback / Explain`
- `Project Fix` の適用前差分プレビュー
- 選択中コードを読み込ませたチャット
- 複数プロジェクト管理
- フォルダツリー表示
- 空ファイル作成 / フォルダ作成 / リネーム
- 画像プレビュー対応 (`png`, `jpg`, `jpeg`)
- アプリ内保存 (`localStorage`, versioned)
- プロジェクトを ZIP でダウンロード
- フォルダ単位アップロード

## Stack

- Frontend: `React`, `Vite`
- Backend: `FastAPI`
- LLM runtime: `llama.cpp` (`llama-server`)
- Desktop wrapper scaffold: `Tauri`

## Project Structure

```text
.
├─ backend_app.py         # FastAPI backend
├─ llama_client.py        # llama-server process manager / streaming client
├─ start_app.bat          # one-click launcher (Windows)
├─ start_app.ps1          # launcher implementation
├─ setup_app.bat          # one-click setup (Windows)
├─ setup_app.ps1          # setup implementation
├─ frontend/
│  ├─ src/App.jsx         # app state / action wiring
│  ├─ src/components/     # UI components
│  ├─ src/utils/          # pure utilities (storage, diff, file helpers)
│  ├─ src/styles.css      # UI styles
│  └─ src-tauri/          # Tauri scaffold
├─ model/                 # GGUF model placement directory (git ignored)
└─ llama.cpp/             # llama.cpp build directory (git ignored)
```

## Requirements

- Windows
- Python 3.10+
- Node.js / npm
- `llama.cpp` の `llama-server.exe`
- GGUF model

## Setup

### 1. Install frontend dependencies

```powershell
cd "C:\Users\Tanyo\Desktop\Self-evolution game\frontend"
npm install
```

### 2. Prepare `llama.cpp`

以下のいずれかに `llama-server.exe` がある構成を想定しています。

- `.\llama.cpp\build\bin\Release\llama-server.exe`
- `.\llama.cpp\build\bin\llama-server.exe`
- `.\llama-server.exe`

別の場所にある場合は環境変数で指定できます。

```powershell
$env:LLAMA_SERVER_BIN="C:\path\to\llama-server.exe"
```

### 3. Prepare model

既定では以下を参照します。

```text
.\model\Qwen3.5-9B-Q4_K_S.gguf
```

別モデルを使う場合:

```powershell
$env:LLAMA_MODEL_PATH="C:\path\to\model.gguf"
```

## Run

### One-click startup

初回セットアップ:

```powershell
.\setup_app.bat
```

その後の起動:

```powershell
.\start_app.bat
```

これで以下をまとめて起動します。

- FastAPI backend: `http://127.0.0.1:8001`
- Vite frontend
- browser open

### Manual startup

1. Backend

```powershell
cd "C:\Users\Tanyo\Desktop\Self-evolution game"
python -m uvicorn backend_app:app --reload --port 8001
```

2. Frontend

```powershell
cd "C:\Users\Tanyo\Desktop\Self-evolution game\frontend"
npm run dev
```

## Included Setup Scripts

- [`setup_app.bat`](c:/Users/Tanyo/Desktop/Self-evolution%20game/setup_app.bat)
  Windows 用の初回セットアップ起動
- [`setup_app.ps1`](c:/Users/Tanyo/Desktop/Self-evolution%20game/setup_app.ps1)
  次を自動で実行します
  - Python / Node / npm の存在確認
  - `.venv` の作成
  - `requirements.txt` のインストール
  - `frontend` の `npm install`
  - `llama-server.exe` とモデル配置の確認
- [`start_app.bat`](c:/Users/Tanyo/Desktop/Self-evolution%20game/start_app.bat)
  起動前に依存関係とモデル配置をチェックしてからアプリ起動

## Frontend Architecture

フロントエンドは「状態を持つ `App.jsx`」と「表示用コンポーネント」「純粋なユーティリティ」に分けています。

- `frontend/src/App.jsx`
  状態管理と API 呼び出しの接着点
- `frontend/src/components/`
  `AppHeader`, `ProjectSidebar`, `EditorPanel`, `ChatModal` などの表示コンポーネント
- `frontend/src/utils/fileUtils.js`
  ファイル種別判定、ツリー構築、アップロード補助
- `frontend/src/utils/projectStorage.js`
  保存形式の version 管理と復元
- `frontend/src/utils/diffUtils.js`
  `Project Fix` 用の差分プレビュー生成
- `frontend/src/utils/streamUtils.js`
  NDJSON ストリーム読取

## Notes

- `model/` と `llama.cpp/` は Git 管理対象外です。
- 初回応答時はモデルロードのため時間がかかることがあります。
- `Project Fix` は入力サイズが大きすぎるとコンテキスト制限に当たることがあります。
- Tauri の雛形はありますが、通常利用は現在ブラウザ UI 前提です。

## Current State

このプロジェクトは「ローカル LLM を使うコード支援ツール」のプロトタイプ兼実験環境です。  
主要機能は揃っており、フロントエンドも `components` / `utils` に分割済みです。次の課題は、より大きいプロジェクト向けのコンテキスト制御、差分 UX の強化、設定画面の整理です。

## Future Ideas

- より大きいプロジェクト向けのコンテキスト圧縮
- Monaco Editor ベースの編集体験
- ファイル単位 `Fix` の差分表示
- 保存データの export / import
- Tauri 化の本格対応
