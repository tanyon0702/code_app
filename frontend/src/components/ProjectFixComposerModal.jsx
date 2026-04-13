export default function ProjectFixComposerModal({
  open,
  mode = "project",
  instruction,
  onClose,
  onChangeInstruction,
  onSubmit,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <section className="prompt-modal panel" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="panel-kicker">{mode === "file" ? "File Fix" : "Project Fix"}</p>
            <h2>修正要望を入力</h2>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="prompt-copy">
          {mode === "file"
            ? "追加の修正要望があれば入力してください。空のまま送ると、選択中ファイルを自動で修正します。"
            : "追加の修正要望があれば入力してください。空のまま送ると、自動で全体整合性ベースの修正を行います。"}
        </p>

        <textarea
          className="chat-input"
          value={instruction}
          onChange={(event) => onChangeInstruction(event.target.value)}
          placeholder="例: API のエラーハンドリングを統一して、型のズレを直して"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />

        <div className="tool-actions">
          <span className="tool-hint">`Ctrl+Enter` で実行</span>
          <button className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={onSubmit}>
            {mode === "file" ? "Start Fix" : "Start Project Fix"}
          </button>
        </div>
      </section>
    </div>
  );
}
