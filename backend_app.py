from __future__ import annotations

import json
from queue import Queue
from threading import Thread
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from llama_client import LlamaClientError, generate_reply


ALLOWED_ACTIONS = {"fix", "advice", "explain"}
ALLOWED_PROJECT_ACTIONS = {"fix", "advice", "explain"}

app = FastAPI(title="Local LLM Code Assistant API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CodeActionRequest(BaseModel):
    code: str = ""
    instruction: str = ""
    language: str = "plaintext"
    filename: str = ""


class ProjectFileRequest(BaseModel):
    filename: str
    content: str
    language: str = "plaintext"


class ProjectActionRequest(BaseModel):
    files: list[ProjectFileRequest]
    instruction: str = ""


class ChatMessageRequest(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessageRequest]
    context: str = ""


def _validate_action(action: str) -> None:
    if action not in ALLOWED_ACTIONS:
        raise HTTPException(status_code=400, detail="Unsupported action.")


def _validate_project_action(action: str) -> None:
    if action not in ALLOWED_PROJECT_ACTIONS:
        raise HTTPException(status_code=400, detail="Unsupported project action.")


def _build_code_action_prompt(action: str, request: CodeActionRequest) -> str:
    file_info = f"ファイル名: {request.filename}\n" if request.filename else ""

    if action == "fix":
        extra = request.instruction.strip() or "バグ修正、構文修正、明らかな改善を行ってください。"
        return (
            "以下のコードを修正してください。\n"
            "必ず修正後のコード全文だけを返してください。説明文やコードフェンスは禁止です。\n"
            "コードが長くても省略せず、全文を最後まで返してください。\n"
            f"追加要望: {extra}\n"
            f"言語: {request.language}\n\n"
            f"{file_info}"
            "コード:\n"
            f"{request.code}"
        )

    if action == "advice":
        extra = request.instruction.strip() or "改善点、バグの可能性、可読性、保守性の観点で短く具体的に助言してください。"
        return (
            "以下のコードに対してアドバイスをしてください。\n"
            "箇条書きで、短く具体的に返してください。\n"
            f"観点: {extra}\n"
            f"言語: {request.language}\n\n"
            f"{file_info}"
            "コード:\n"
            f"{request.code}"
        )

    extra = request.instruction.strip() or "コードの役割、流れ、重要なポイントをわかりやすく説明してください。"
    return (
        "以下のコードを説明してください。\n"
        "全体像を先に、その後に重要な処理を説明してください。\n"
        f"追加要望: {extra}\n"
        f"言語: {request.language}\n\n"
        f"{file_info}"
        "コード:\n"
        f"{request.code}"
    )


def _serialize_project_files(files: list[ProjectFileRequest]) -> str:
    chunks = []
    for file in files:
        chunks.append(
            f"--- FILE: {file.filename} ({file.language}) ---\n"
            f"{file.content}\n"
        )
    return "\n".join(chunks)


def _build_project_action_prompt(action: str, request: ProjectActionRequest) -> str:
    project_body = _serialize_project_files(request.files)

    if action == "fix":
        extra = request.instruction.strip() or "プロジェクト全体の整合性を保ちながら、必要な修正を行ってください。"
        return (
            "以下は同一プロジェクト内の複数ファイルです。\n"
            "ファイル同士の依存関係と整合性を考慮して修正してください。\n"
            "必ず有効なJSONだけを返してください。説明文やコードフェンスは禁止です。\n"
            'JSON形式は {"files":[{"filename":"path","content":"full file content"}]} としてください。\n'
            "変更が必要なファイルだけを files に含めてください。\n"
            "各 content には修正後のファイル全文を入れてください。省略は禁止です。\n"
            f"追加要望: {extra}\n\n"
            f"{project_body}"
        )

    if action == "advice":
        extra = request.instruction.strip() or "プロジェクト全体の改善点、バグの可能性、設計上の懸念を具体的に助言してください。"
        return (
            "以下は同一プロジェクト内の複数ファイルです。\n"
            "ファイル同士の関係を考慮して、プロジェクト全体へのフィードバックを返してください。\n"
            "箇条書きで、重要度の高いものから短く具体的に書いてください。\n"
            f"追加要望: {extra}\n\n"
            f"{project_body}"
        )

    extra = request.instruction.strip() or "プロジェクト全体の構成、役割分担、処理の流れをわかりやすく説明してください。"
    return (
        "以下は同一プロジェクト内の複数ファイルです。\n"
        "ファイル間のつながりを考慮して、プロジェクト全体を説明してください。\n"
        "最初に全体像、その後に主要ファイルの役割、最後に処理の流れを説明してください。\n"
        f"追加要望: {extra}\n\n"
        f"{project_body}"
    )


def _estimate_max_tokens(action: str, code: str) -> int:
    estimated_tokens = max(512, min(8192, int(len(code) / 2.2)))

    if action == "fix":
        return max(1536, min(8192, estimated_tokens))
    if action == "explain":
        return max(768, min(3072, int(estimated_tokens * 0.6)))
    return max(512, min(2048, int(estimated_tokens * 0.45)))


def _estimate_project_max_tokens(action: str, files: list[ProjectFileRequest]) -> int:
    total_length = sum(len(file.content) for file in files)
    estimated_tokens = max(2048, min(12000, int(total_length / 2.0)))

    if action == "fix":
        return max(3072, min(12000, estimated_tokens))
    if action == "explain":
        return max(1536, min(6144, int(estimated_tokens * 0.5)))
    return max(1024, min(4096, int(estimated_tokens * 0.35)))


def _build_chat_input(request: ChatRequest) -> tuple[list[dict[str, str]], str]:
    if not request.messages:
        raise HTTPException(status_code=400, detail="Chat messages are empty.")

    normalized_messages = [
        {"role": message.role, "content": message.content}
        for message in request.messages
        if message.role in {"user", "assistant"} and message.content.strip()
    ]
    if not normalized_messages:
        raise HTTPException(status_code=400, detail="Chat messages are empty.")

    latest_message = normalized_messages[-1]
    if latest_message["role"] != "user":
        raise HTTPException(status_code=400, detail="Last chat message must be from user.")

    history = normalized_messages[:-1]
    user_message = latest_message["content"]

    if request.context.strip():
        user_message = (
            "以下の現在のコード文脈も踏まえて回答してください。\n"
            "必要なときだけコード内容を参照し、質問に直接関係ない部分まで冗長に説明しないでください。\n\n"
            f"{request.context.strip()}\n\n"
            f"質問:\n{user_message}"
        )

    return history, user_message


def _stream_code_action_events(action: str, request: CodeActionRequest):
    queue: Queue[dict[str, Any] | None] = Queue()

    def on_status(status: str) -> None:
        queue.put({"type": "status", "value": status})

    def on_token(partial: str) -> None:
        queue.put({"type": "token", "value": partial})

    def worker() -> None:
        try:
            result = generate_reply(
                [],
                _build_code_action_prompt(action, request),
                on_status=on_status,
                on_token=on_token,
                max_tokens=_estimate_max_tokens(action, request.code),
            )
            queue.put({"type": "done", "value": result})
        except LlamaClientError as exc:
            queue.put({"type": "error", "value": str(exc)})
        except Exception as exc:
            queue.put({"type": "error", "value": f"Unexpected error: {exc}"})
        finally:
            queue.put(None)

    Thread(target=worker, daemon=True).start()

    while True:
        item = queue.get()
        if item is None:
            break
        yield json.dumps(item, ensure_ascii=False) + "\n"


def _stream_project_action_events(action: str, request: ProjectActionRequest):
    queue: Queue[dict[str, Any] | None] = Queue()

    def on_status(status: str) -> None:
        queue.put({"type": "status", "value": status})

    def on_token(partial: str) -> None:
        queue.put({"type": "token", "value": partial})

    def worker() -> None:
        try:
            result = generate_reply(
                [],
                _build_project_action_prompt(action, request),
                on_status=on_status,
                on_token=on_token,
                max_tokens=_estimate_project_max_tokens(action, request.files),
            )
            queue.put({"type": "done", "value": result})
        except LlamaClientError as exc:
            queue.put({"type": "error", "value": str(exc)})
        except Exception as exc:
            queue.put({"type": "error", "value": f"Unexpected error: {exc}"})
        finally:
            queue.put(None)

    Thread(target=worker, daemon=True).start()

    while True:
        item = queue.get()
        if item is None:
            break
        yield json.dumps(item, ensure_ascii=False) + "\n"


def _stream_chat_events(request: ChatRequest):
    queue: Queue[dict[str, Any] | None] = Queue()

    def on_status(status: str) -> None:
        queue.put({"type": "status", "value": status})

    def on_token(partial: str) -> None:
        queue.put({"type": "token", "value": partial})

    def worker() -> None:
        try:
            history, user_message = _build_chat_input(request)
            result = generate_reply(
                history,
                user_message,
                on_status=on_status,
                on_token=on_token,
                max_tokens=2048,
            )
            queue.put({"type": "done", "value": result})
        except LlamaClientError as exc:
            queue.put({"type": "error", "value": str(exc)})
        except HTTPException as exc:
            queue.put({"type": "error", "value": str(exc.detail)})
        except Exception as exc:
            queue.put({"type": "error", "value": f"Unexpected error: {exc}"})
        finally:
            queue.put(None)

    Thread(target=worker, daemon=True).start()

    while True:
        item = queue.get()
        if item is None:
            break
        yield json.dumps(item, ensure_ascii=False) + "\n"


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/code/{action}")
def code_action(action: str, request: CodeActionRequest) -> dict[str, str]:
    _validate_action(action)
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code is empty.")

    try:
        result = generate_reply(
            [],
            _build_code_action_prompt(action, request),
            max_tokens=_estimate_max_tokens(action, request.code),
        )
    except LlamaClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"result": result}


@app.post("/api/code/{action}/stream")
def code_action_stream(action: str, request: CodeActionRequest) -> StreamingResponse:
    _validate_action(action)
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="Code is empty.")

    return StreamingResponse(
        _stream_code_action_events(action, request),
        media_type="application/x-ndjson",
    )


@app.post("/api/project/{action}/stream")
def project_action_stream(action: str, request: ProjectActionRequest) -> StreamingResponse:
    _validate_project_action(action)
    if not request.files:
        raise HTTPException(status_code=400, detail="Project files are empty.")

    return StreamingResponse(
        _stream_project_action_events(action, request),
        media_type="application/x-ndjson",
    )


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        _stream_chat_events(request),
        media_type="application/x-ndjson",
    )


@app.exception_handler(HTTPException)
def http_exception_handler(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
