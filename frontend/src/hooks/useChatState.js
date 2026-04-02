import { useRef, useState } from "react";
import { readNdjsonStream } from "../utils/streamUtils";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8001";

export const INITIAL_CHAT_MESSAGE = {
  id: globalThis.crypto?.randomUUID?.() ?? "chat-welcome",
  role: "assistant",
  content: "質問を入力してください。必要なら先に現在のコードを読み込ませられます。",
};

export function useChatState(setStatus, selectedFile) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([INITIAL_CHAT_MESSAGE]);
  const [chatContext, setChatContext] = useState(null);
  const chatBodyRef = useRef(null);

  function resetChatState() {
    setChatContext(null);
    setChatMessages([INITIAL_CHAT_MESSAGE]);
  }

  function loadCurrentCodeIntoChat() {
    if (!selectedFile || selectedFile.kind !== "text") {
      return;
    }

    const context = {
      filename: selectedFile.name,
      path: selectedFile.path,
      language: selectedFile.language,
      content: selectedFile.content,
    };

    setChatContext(context);
    setChatOpen(true);
    setChatMessages((current) => [
      ...current,
      {
        id: globalThis.crypto?.randomUUID?.() ?? `chat-context-${Date.now()}`,
        role: "assistant",
        content: `現在のコードを読み込みました: ${context.filename}`,
      },
    ]);
    setStatus(`${context.filename} をチャット文脈に追加`);
  }

  async function sendChatMessage() {
    const prompt = chatInput.trim();
    if (!prompt || chatBusy) {
      return;
    }

    const userMessage = {
      id: globalThis.crypto?.randomUUID?.() ?? `chat-user-${Date.now()}`,
      role: "user",
      content: prompt,
    };
    const assistantId = globalThis.crypto?.randomUUID?.() ?? `chat-assistant-${Date.now()}`;
    const nextMessages = [...chatMessages, userMessage];

    setChatMessages([...nextMessages, { id: assistantId, role: "assistant", content: "" }]);
    setChatInput("");
    setChatBusy(true);
    setStatus("チャット送信中...");

    const contextText = chatContext
      ? `ファイル名: ${chatContext.path}\n言語: ${chatContext.language}\nコード:\n${chatContext.content}`
      : "";

    try {
      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          context: contextText,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }

      await readNdjsonStream(response, (eventData) => {
        if (eventData.type === "status") {
          setStatus(eventData.value);
          return;
        }

        if (eventData.type === "token" || eventData.type === "done") {
          setChatMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: eventData.value } : message,
            ),
          );
          return;
        }

        if (eventData.type === "error") {
          throw new Error(eventData.value);
        }
      });

      setStatus("chat completed");
    } catch (error) {
      setChatMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, content: `エラー: ${error.message}` } : message,
        ),
      );
      setStatus("エラー");
    } finally {
      setChatBusy(false);
      window.setTimeout(() => {
        chatBodyRef.current?.scrollTo({ top: chatBodyRef.current.scrollHeight, behavior: "smooth" });
      }, 0);
    }
  }

  function clearChat() {
    setChatMessages([INITIAL_CHAT_MESSAGE]);
  }

  return {
    chatOpen,
    setChatOpen,
    chatBusy,
    chatInput,
    setChatInput,
    chatMessages,
    chatContext,
    chatBodyRef,
    resetChatState,
    loadCurrentCodeIntoChat,
    sendChatMessage,
    clearChat,
  };
}
