function DiffBlock({ item }) {
  return (
    <article className="diff-card">
      <header className="diff-card-header">
        <strong>{item.filename}</strong>
        <span>
          {item.diff.beforeLineCount} lines → {item.diff.afterLineCount} lines
        </span>
      </header>
      <pre className="diff-output">
        {item.diff.lines.length > 0
          ? item.diff.lines.map((line, index) => (
              <div key={`${item.filename}-${index}`} className={`diff-line ${line.type}`}>
                <span className="diff-prefix">
                  {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                </span>
                <span>{line.text}</span>
              </div>
            ))
          : "No changes"}
      </pre>
    </article>
  );
}

export default function AssistantModal({
  toolModal,
  onClose,
  fixPreview,
  selectedFile,
  onApplyFix,
  onDownloadFixed,
  projectFixPreview,
  projectFixDiffs,
  onApplyProjectFix,
}) {
  if (!toolModal.open) {
    return null;
  }

  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <section className="tool-modal panel" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Assistant Result</p>
            <h2>{toolModal.title}</h2>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        {toolModal.mode === "project-fix" && projectFixDiffs.length > 0 ? (
          <div className="project-fix-preview">
            <div className="tool-hint">
              {projectFixPreview.length} files parsed. Apply 前に差分を確認できます。
            </div>
            <div className="diff-list">
              {projectFixDiffs.map((item) => (
                <DiffBlock key={item.filename} item={item} />
              ))}
            </div>
          </div>
        ) : (
          <pre className="tool-output">{toolModal.content || "..."}</pre>
        )}

        {toolModal.mode === "fix" ? (
          <div className="tool-actions">
            <button className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" onClick={onApplyFix} disabled={!fixPreview}>
              Apply Fix
            </button>
            <button
              className="ghost-button"
              onClick={() => selectedFile && fixPreview && onDownloadFixed(`fixed-${selectedFile.name}`, fixPreview)}
              disabled={!selectedFile || !fixPreview}
            >
              Download Fixed
            </button>
          </div>
        ) : null}

        {toolModal.mode === "project-fix" ? (
          <div className="tool-actions">
            <span className="tool-hint">
              {projectFixPreview.length > 0
                ? `${projectFixPreview.length} files will be updated`
                : "JSONを解析できた場合のみ適用できます"}
            </span>
            <button className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" onClick={onApplyProjectFix} disabled={projectFixPreview.length === 0}>
              Apply Project Fix
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
