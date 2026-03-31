from __future__ import annotations

import atexit
import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from threading import Lock, Thread
from typing import Callable


ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = ROOT_DIR / "model" / "Qwen3.5-9B-Q4_K_S.gguf"
DEFAULT_CTX_SIZE = int(os.environ.get("LLAMA_CTX_SIZE", "16384"))
DEFAULT_SERVER_CANDIDATES = (
    ROOT_DIR / "llama.cpp" / "build" / "bin" / "Release" / "llama-server.exe",
    ROOT_DIR / "llama.cpp" / "build" / "bin" / "llama-server.exe",
    ROOT_DIR / "llama-server.exe",
)
SYSTEM_PROMPT = "あなたは簡潔で自然な日本語で答えるアシスタントです。"
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8080
SERVER_SLOT_ID = 0


class LlamaClientError(RuntimeError):
    pass


StatusCallback = Callable[[str], None]
TokenCallback = Callable[[str], None]


class _LlamaServerManager:
    def __init__(self) -> None:
        self._process: subprocess.Popen[str] | None = None
        self._lock = Lock()
        self._last_logs: list[str] = []

    def ensure_started(self, on_status: StatusCallback | None = None) -> None:
        with self._lock:
            if self._is_healthy():
                return

            if self._process is None or self._process.poll() is not None:
                self._start_process(on_status)

        self._wait_until_ready(on_status)

    def close(self) -> None:
        with self._lock:
            if self._process is None:
                return
            if self._process.poll() is None:
                self._process.terminate()
                try:
                    self._process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self._process.kill()
            self._process = None

    def _start_process(self, on_status: StatusCallback | None) -> None:
        server_path = _resolve_server_path()
        model_path = _resolve_model_path()
        command = [
            str(server_path),
            "-m",
            str(model_path),
            "--host",
            SERVER_HOST,
            "--port",
            str(SERVER_PORT),
            "--ctx-size",
            str(DEFAULT_CTX_SIZE),
            "--parallel",
            "1",
            "--slot-prompt-similarity",
            "0.1",
            "--cache-prompt",
            "--cache-reuse",
            "256",
            "--jinja",
            "--no-webui",
        ]

        _emit_status(on_status, "llama-server を起動中...")

        try:
            process = subprocess.Popen(
                command,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
        except FileNotFoundError as exc:
            raise LlamaClientError("llama-server executable could not be launched.") from exc

        self._process = process
        self._last_logs = []
        Thread(target=self._capture_logs, args=(process, on_status), daemon=True).start()

    def _capture_logs(self, process: subprocess.Popen[str], on_status: StatusCallback | None) -> None:
        if process.stderr is None:
            return

        for raw_line in process.stderr:
            line = raw_line.strip()
            if not line:
                continue

            self._last_logs.append(line)
            self._last_logs = self._last_logs[-40:]

            lowered = line.lower()
            if "loading model" in lowered or "load" in lowered or "offload" in lowered:
                _emit_status(on_status, "モデル読み込み中...")
            elif "server is listening" in lowered or "listening" in lowered:
                _emit_status(on_status, "サーバー待機中...")

    def _wait_until_ready(self, on_status: StatusCallback | None) -> None:
        deadline = time.time() + 120
        _emit_status(on_status, "サーバー準備待ち...")

        while time.time() < deadline:
            if self._process is not None and self._process.poll() is not None:
                logs = "\n".join(self._last_logs[-10:]).strip() or "llama-server exited unexpectedly."
                raise LlamaClientError(logs)

            if self._is_healthy():
                _emit_status(on_status, "サーバー準備完了")
                return

            time.sleep(0.5)

        raise LlamaClientError("Timed out while waiting for llama-server to become ready.")

    def _is_healthy(self) -> bool:
        try:
            with urllib.request.urlopen(f"http://{SERVER_HOST}:{SERVER_PORT}/health", timeout=2) as response:
                payload = response.read().decode("utf-8", errors="replace")
                return response.status == 200 and "ok" in payload.lower()
        except (urllib.error.URLError, TimeoutError, socket.timeout):
            return False


_SERVER_MANAGER = _LlamaServerManager()
atexit.register(_SERVER_MANAGER.close)


def _resolve_server_path() -> Path:
    env_path = os.environ.get("LLAMA_SERVER_BIN")
    if env_path:
        candidate = Path(env_path).expanduser()
        if candidate.exists():
            return candidate
        raise LlamaClientError(f"llama-server executable was not found: {candidate}")

    for candidate in DEFAULT_SERVER_CANDIDATES:
        if candidate.exists():
            return candidate

    raise LlamaClientError(
        "llama-server executable was not found. Set LLAMA_SERVER_BIN to your llama-server executable path."
    )


def _resolve_model_path() -> Path:
    env_path = os.environ.get("LLAMA_MODEL_PATH")
    if env_path:
        candidate = Path(env_path).expanduser()
        if candidate.exists():
            return candidate
        raise LlamaClientError(f"GGUF model was not found: {candidate}")

    if DEFAULT_MODEL_PATH.exists():
        return DEFAULT_MODEL_PATH

    raise LlamaClientError(
        "GGUF model was not found. Put the model in ./model or set LLAMA_MODEL_PATH."
    )


def _emit_status(callback: StatusCallback | None, message: str) -> None:
    if callback is not None:
        callback(message)


def _build_messages(history: list[dict[str, str]], user_message: str) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})
    return messages


def _extract_stream_delta(event: dict) -> str:
    choices = event.get("choices")
    if isinstance(choices, list) and choices:
        delta = choices[0].get("delta", {})
        if isinstance(delta, dict):
            content = delta.get("content")
            if isinstance(content, str):
                return content
    content = event.get("content")
    return content if isinstance(content, str) else ""


def generate_reply(
    history: list[dict[str, str]],
    user_message: str,
    on_status: StatusCallback | None = None,
    on_token: TokenCallback | None = None,
    max_tokens: int = 256,
) -> str:
    _SERVER_MANAGER.ensure_started(on_status)
    _emit_status(on_status, "会話を送信中...")

    request_body = json.dumps(
        {
            "messages": _build_messages(history, user_message),
            "stream": True,
            "cache_prompt": True,
            "n_cache_reuse": 256,
            "id_slot": SERVER_SLOT_ID,
            "temperature": 0.7,
            "max_tokens": max_tokens,
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        url=f"http://{SERVER_HOST}:{SERVER_PORT}/v1/chat/completions",
        data=request_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    reply_parts: list[str] = []
    _emit_status(on_status, "応答生成中...")

    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            for raw_line in response:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line or not line.startswith("data: "):
                    continue

                payload = line[6:]
                if payload == "[DONE]":
                    break

                event = json.loads(payload)

                if "prompt_progress" in event:
                    progress = event["prompt_progress"]
                    if isinstance(progress, dict):
                        total = progress.get("total", 0)
                        processed = progress.get("processed", 0)
                        _emit_status(on_status, f"プロンプト処理中... {processed}/{total}")
                    continue

                delta = _extract_stream_delta(event)
                if not delta:
                    continue

                reply_parts.append(delta)
                if on_token is not None:
                    on_token("".join(reply_parts))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise LlamaClientError(detail or str(exc)) from exc
    except urllib.error.URLError as exc:
        raise LlamaClientError(f"Failed to connect to llama-server: {exc.reason}") from exc

    reply = "".join(reply_parts).strip()
    if not reply:
        raise LlamaClientError("The model returned an empty response.")

    _emit_status(on_status, "生成完了")
    return reply
