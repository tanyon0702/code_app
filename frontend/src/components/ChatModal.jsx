export default function ChatModal({
  open,
  chatContext,
  chatMessages,
  chatInput,
  chatBusy,
  chatBodyRef,
  selectedFile,
  onClose,
  onLoadCurrentCodeIntoChat,
  onChangeChatInput,
  onClearChat,
  onSendChatMessage,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <section className="tool-modal panel chat-panel" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Code Chat</p>
            <h2>Ask About Current Code</h2>
          </div>
          <div className="action-cluster">
            <button
              className="ghost-button compact"
              onClick={onLoadCurrentCodeIntoChat}
              disabled={!selectedFile || selectedFile.kind !== "text"}
            >
              Read Current File
            </button>
            <button className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="chat-context-pill">
          {chatContext ? `Context: ${chatContext.filename}` : "Context: none"}
        </div>

        <div className="chat-thread" ref={chatBodyRef}>
          {chatMessages.map((message) => (
            <article key={message.id} className={`chat-bubble ${message.role}`}>
              <span className="chat-role">{message.role === "user" ? "You" : "AI"}</span>
              <p>{message.content || "..."}</p>
            </article>
          ))}
        </div>

        <div className="chat-composer">
          <textarea
            className="chat-input"
            value={chatInput}
            onChange={(event) => onChangeChatInput(event.target.value)}
            placeholder="コードについて質問してください"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSendChatMessage();
              }
            }}
          />
          <div className="tool-actions">
            <button className="ghost-button" onClick={onClearChat}>
              Clear Chat
            </button>
            <button className="primary-button" onClick={onSendChatMessage} disabled={chatBusy || !chatInput.trim()}>
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
