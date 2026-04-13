from __future__ import annotations

import atexit
import json
import os
import socket
import struct
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from threading import Lock, Thread
from typing import Any, Callable


ROOT_DIR = Path(__file__).resolve().parent
MODEL_DIR = ROOT_DIR / "model"
DEFAULT_MODEL_PATH = MODEL_DIR / "Qwen3.5-9B-Q4_K_S.gguf"
DEFAULT_CTX_SIZE = int(os.environ.get("LLAMA_CTX_SIZE", "16384"))
DEFAULT_GPU_LAYERS = int(os.environ.get("LLAMA_GPU_LAYERS", "-1"))
DEFAULT_SERVER_CANDIDATES = (
    ROOT_DIR / "llama.cpp" / "build" / "bin" / "Release" / "llama-server.exe",
    ROOT_DIR / "llama.cpp" / "build" / "bin" / "llama-server.exe",
    ROOT_DIR / "llama-server.exe",
)
SYSTEM_PROMPT = "あなたは簡潔で自然な日本語で答えるアシスタントです。"
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8080
SERVER_SLOT_ID = 0
GGUF_MAGIC = b"GGUF"


class LlamaClientError(RuntimeError):
    pass


StatusCallback = Callable[[str], None]
TokenCallback = Callable[[str], None]


@dataclass(frozen=True)
class RuntimeConfig:
    model_path: str
    gpu_layers: int = DEFAULT_GPU_LAYERS
    ctx_size: int = DEFAULT_CTX_SIZE


GGUF_VALUE_TYPES: dict[int, tuple[str, str | None]] = {
    0: ("B", None),
    1: ("b", None),
    2: ("H", None),
    3: ("h", None),
    4: ("I", None),
    5: ("i", None),
    6: ("f", None),
    7: ("?", None),
    8: ("string", None),
    9: ("array", None),
    10: ("Q", None),
    11: ("q", None),
    12: ("d", None),
}


class _GGUFReader:
    def __init__(self, path: Path) -> None:
        self.path = path

    def read_metadata(self) -> dict[str, Any]:
        with self.path.open("rb") as handle:
            if handle.read(4) != GGUF_MAGIC:
                raise LlamaClientError(f"Unsupported model file: {self.path.name}")

            version = self._read_struct(handle, "<I")
            if version < 2:
                raise LlamaClientError(f"Unsupported GGUF version: {version}")

            tensor_count = self._read_struct(handle, "<Q")
            metadata_count = self._read_struct(handle, "<Q")
            metadata: dict[str, Any] = {"gguf.version": version, "gguf.tensor_count": tensor_count}

            for _ in range(metadata_count):
                key = self._read_string(handle)
                value_type = self._read_struct(handle, "<I")
                metadata[key] = self._read_value(handle, value_type)

            return metadata

    def _read_struct(self, handle, fmt: str):
        size = struct.calcsize(fmt)
        data = handle.read(size)
        if len(data) != size:
            raise LlamaClientError(f"Failed to parse GGUF metadata from {self.path.name}")
        return struct.unpack(fmt, data)[0]

    def _read_string(self, handle) -> str:
        length = self._read_struct(handle, "<Q")
        data = handle.read(length)
        if len(data) != length:
            raise LlamaClientError(f"Failed to parse GGUF string value from {self.path.name}")
        return data.decode("utf-8", errors="replace")

    def _read_value(self, handle, value_type: int):
        if value_type == 8:
            return self._read_string(handle)

        if value_type == 9:
            element_type = self._read_struct(handle, "<I")
            length = self._read_struct(handle, "<Q")
            return [self._read_value(handle, element_type) for _ in range(length)]

        type_info = GGUF_VALUE_TYPES.get(value_type)
        if type_info is None or type_info[0] in {"string", "array"}:
            raise LlamaClientError(f"Unsupported GGUF value type: {value_type}")

        return self._read_struct(handle, f"<{type_info[0]}")


def _format_bytes(value: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(max(0, value))
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{size:.1f} TB"


def _estimate_memory_requirements(
    model_path: Path,
    metadata: dict[str, Any],
    gpu_layers: int,
    ctx_size: int,
) -> dict[str, Any]:
    architecture = str(metadata.get("general.architecture", "unknown"))
    total_layers = int(metadata.get(f"{architecture}.block_count", 0) or 0)
    embedding_length = int(metadata.get(f"{architecture}.embedding_length", 0) or 0)
    head_count = int(metadata.get(f"{architecture}.attention.head_count", 0) or 0)
    head_count_kv = int(metadata.get(f"{architecture}.attention.head_count_kv", 0) or 0)
    context_length = int(metadata.get(f"{architecture}.context_length", 0) or 0)

    file_size_bytes = model_path.stat().st_size
    available_layers = max(total_layers, 1)
    resolved_gpu_layers = available_layers if gpu_layers < 0 else min(max(gpu_layers, 0), available_layers)
    gpu_fraction = min(max(resolved_gpu_layers / available_layers, 0.0), 1.0)

    kv_hidden = embedding_length
    if embedding_length > 0 and head_count > 0 and head_count_kv > 0:
        kv_hidden = int(embedding_length * (head_count_kv / head_count))

    kv_cache_bytes = 0
    if total_layers > 0 and kv_hidden > 0 and ctx_size > 0:
        kv_cache_bytes = ctx_size * total_layers * kv_hidden * 4

    weight_vram = int(file_size_bytes * gpu_fraction)
    weight_ram = file_size_bytes - weight_vram
    kv_vram = int(kv_cache_bytes * gpu_fraction)
    kv_ram = kv_cache_bytes - kv_vram

    runtime_overhead_bytes = int(file_size_bytes * 0.08) + (512 * 1024 * 1024)
    vram_total = weight_vram + kv_vram
    ram_total = weight_ram + kv_ram + runtime_overhead_bytes

    return {
        "model_path": str(model_path),
        "file_size_bytes": file_size_bytes,
        "file_size_label": _format_bytes(file_size_bytes),
        "architecture": architecture,
        "total_layers": total_layers,
        "resolved_gpu_layers": resolved_gpu_layers,
        "requested_gpu_layers": gpu_layers,
        "gpu_offload_ratio": round(gpu_fraction, 4),
        "ctx_size": ctx_size,
        "trained_context_length": context_length,
        "embedding_length": embedding_length,
        "kv_hidden": kv_hidden,
        "kv_cache_bytes": kv_cache_bytes,
        "kv_cache_label": _format_bytes(kv_cache_bytes),
        "estimated_vram_bytes": vram_total,
        "estimated_vram_label": _format_bytes(vram_total),
        "estimated_ram_bytes": ram_total,
        "estimated_ram_label": _format_bytes(ram_total),
        "weight_vram_bytes": weight_vram,
        "weight_ram_bytes": weight_ram,
        "note": "概算です。量子化方式、KV cache の配置、ドライバ、他プロセス使用量で増減します。",
    }


def _safe_read_metadata(model_path: Path) -> dict[str, Any]:
    try:
        return _GGUFReader(model_path).read_metadata()
    except Exception as exc:
        return {"error": str(exc)}


def _build_model_info(model_path: Path, gpu_layers: int, ctx_size: int) -> dict[str, Any]:
    metadata = _safe_read_metadata(model_path)
    architecture = str(metadata.get("general.architecture", "unknown"))
    display_name = str(metadata.get("general.name") or model_path.stem)

    info = {
        "path": str(model_path),
        "name": display_name,
        "file_name": model_path.name,
        "architecture": architecture,
        "file_size_bytes": model_path.stat().st_size,
        "file_size_label": _format_bytes(model_path.stat().st_size),
        "total_layers": int(metadata.get(f"{architecture}.block_count", 0) or 0),
        "trained_context_length": int(metadata.get(f"{architecture}.context_length", 0) or 0),
        "embedding_length": int(metadata.get(f"{architecture}.embedding_length", 0) or 0),
        "metadata_error": metadata.get("error"),
    }
    info["estimate"] = _estimate_memory_requirements(model_path, metadata, gpu_layers, ctx_size)
    return info


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


def _resolve_default_model_path() -> Path:
    env_path = os.environ.get("LLAMA_MODEL_PATH")
    if env_path:
        candidate = Path(env_path).expanduser()
        if candidate.exists():
            return candidate
        raise LlamaClientError(f"GGUF model was not found: {candidate}")

    if DEFAULT_MODEL_PATH.exists():
        return DEFAULT_MODEL_PATH

    models = list_available_models(DEFAULT_GPU_LAYERS, DEFAULT_CTX_SIZE)
    if models:
        return Path(models[0]["path"])

    raise LlamaClientError("GGUF model was not found. Put the model in ./model or set LLAMA_MODEL_PATH.")


_RUNTIME_CONFIG = RuntimeConfig(
    model_path=str(_resolve_default_model_path()),
    gpu_layers=DEFAULT_GPU_LAYERS,
    ctx_size=DEFAULT_CTX_SIZE,
)
_CONFIG_LOCK = Lock()


def get_runtime_config() -> dict[str, Any]:
    with _CONFIG_LOCK:
        config = _RUNTIME_CONFIG

    model_path = Path(config.model_path)
    metadata = _safe_read_metadata(model_path) if model_path.exists() else {"error": "Model not found"}
    return {
        **asdict(config),
        "model_name": str(metadata.get("general.name") or model_path.stem),
        "estimate": _estimate_memory_requirements(model_path, metadata, config.gpu_layers, config.ctx_size)
        if model_path.exists()
        else None,
    }


def update_runtime_config(
    *,
    model_path: str | None = None,
    gpu_layers: int | None = None,
    ctx_size: int | None = None,
) -> dict[str, Any]:
    global _RUNTIME_CONFIG

    changed = False
    with _CONFIG_LOCK:
        next_model_path = model_path or _RUNTIME_CONFIG.model_path
        resolved_model = Path(next_model_path).expanduser()
        if not resolved_model.exists():
            raise LlamaClientError(f"GGUF model was not found: {resolved_model}")

        next_config = RuntimeConfig(
            model_path=str(resolved_model),
            gpu_layers=_RUNTIME_CONFIG.gpu_layers if gpu_layers is None else int(gpu_layers),
            ctx_size=_RUNTIME_CONFIG.ctx_size if ctx_size is None else max(1024, int(ctx_size)),
        )

        if next_config != _RUNTIME_CONFIG:
            _RUNTIME_CONFIG = next_config
            changed = True

    if changed:
        _SERVER_MANAGER.close()
    return get_runtime_config()


def list_available_models(gpu_layers: int | None = None, ctx_size: int | None = None) -> list[dict[str, Any]]:
    selected_gpu_layers = DEFAULT_GPU_LAYERS if gpu_layers is None else gpu_layers
    selected_ctx_size = DEFAULT_CTX_SIZE if ctx_size is None else ctx_size
    candidates: list[Path] = []

    if MODEL_DIR.exists():
        candidates.extend(sorted(MODEL_DIR.rglob("*.gguf")))

    env_path = os.environ.get("LLAMA_MODEL_PATH")
    if env_path:
        env_model = Path(env_path).expanduser()
        if env_model.exists():
            candidates.append(env_model)

    unique_candidates = list(dict.fromkeys(candidates))
    return [_build_model_info(path, selected_gpu_layers, selected_ctx_size) for path in unique_candidates]


def estimate_runtime_requirements(
    *,
    model_path: str | None = None,
    gpu_layers: int | None = None,
    ctx_size: int | None = None,
) -> dict[str, Any]:
    with _CONFIG_LOCK:
        base = _RUNTIME_CONFIG

    resolved_model = Path(model_path or base.model_path).expanduser()
    if not resolved_model.exists():
        raise LlamaClientError(f"GGUF model was not found: {resolved_model}")

    resolved_gpu_layers = base.gpu_layers if gpu_layers is None else int(gpu_layers)
    resolved_ctx_size = base.ctx_size if ctx_size is None else max(1024, int(ctx_size))
    metadata = _safe_read_metadata(resolved_model)
    return _estimate_memory_requirements(resolved_model, metadata, resolved_gpu_layers, resolved_ctx_size)


class _LlamaServerManager:
    def __init__(self) -> None:
        self._process: subprocess.Popen[str] | None = None
        self._lock = Lock()
        self._last_logs: list[str] = []
        self._loaded_config: RuntimeConfig | None = None

    def ensure_started(self, on_status: StatusCallback | None = None) -> None:
        config = _get_runtime_config_object()
        with self._lock:
            if self._is_healthy() and self._loaded_config == config:
                return

            if self._process is not None and self._loaded_config != config:
                self._stop_process_locked()

            if self._process is None or self._process.poll() is not None:
                self._start_process(config, on_status)

        self._wait_until_ready(on_status)

    def close(self) -> None:
        with self._lock:
            self._stop_process_locked()

    def _stop_process_locked(self) -> None:
        if self._process is None:
            self._loaded_config = None
            return
        if self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None
        self._loaded_config = None

    def _start_process(self, config: RuntimeConfig, on_status: StatusCallback | None) -> None:
        server_path = _resolve_server_path()
        model_path = Path(config.model_path)
        command = [
            str(server_path),
            "-m",
            str(model_path),
            "--host",
            SERVER_HOST,
            "--port",
            str(SERVER_PORT),
            "--ctx-size",
            str(config.ctx_size),
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

        if config.gpu_layers != 0:
            command.extend(["--n-gpu-layers", str(config.gpu_layers)])

        _emit_status(on_status, f"llama-server を起動中... {model_path.name}")

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
        self._loaded_config = config
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


def _get_runtime_config_object() -> RuntimeConfig:
    with _CONFIG_LOCK:
        return _RUNTIME_CONFIG


_SERVER_MANAGER = _LlamaServerManager()
atexit.register(_SERVER_MANAGER.close)


def ensure_server_ready(on_status: StatusCallback | None = None) -> dict[str, Any]:
    _SERVER_MANAGER.ensure_started(on_status)
    return get_runtime_config()


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
