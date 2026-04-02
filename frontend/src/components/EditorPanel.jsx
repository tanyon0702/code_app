export default function EditorPanel({
  selectedFile,
  toolBusy,
  onLoadCurrentCodeIntoChat,
  onRunFix,
  onRunAdvice,
  onRunExplain,
  onDownloadSelectedFile,
  onUpdateSelectedFileContent,
}) {
  return (
    <section className="panel editor-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Code</p>
          <h2>{selectedFile?.name ?? "No file selected"}</h2>
        </div>
        <div className="action-cluster">
          <div className="control-section inline">
            <span className="control-label">File</span>
            <div className="control-buttons">
              <button
                className="ghost-button compact"
                onClick={onDownloadSelectedFile}
                disabled={!selectedFile}
              >
                Download
              </button>
              <button
                className="ghost-button compact"
                onClick={onLoadCurrentCodeIntoChat}
                disabled={!selectedFile || selectedFile.kind !== "text"}
              >
                Read In Chat
              </button>
            </div>
          </div>

          <div className="control-section inline">
            <span className="control-label">File AI</span>
            <div className="control-buttons">
              <button
                className="ghost-button compact accent"
                onClick={onRunFix}
                disabled={!selectedFile || selectedFile.kind !== "text" || toolBusy}
              >
                Fix
              </button>
              <button
                className="ghost-button compact"
                onClick={onRunAdvice}
                disabled={!selectedFile || selectedFile.kind !== "text" || toolBusy}
              >
                Feedback
              </button>
              <button
                className="ghost-button compact"
                onClick={onRunExplain}
                disabled={!selectedFile || selectedFile.kind !== "text" || toolBusy}
              >
                Explain
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedFile ? (
        <>
          <div className="file-meta">
            <span>{selectedFile.kind === "image" ? "image" : selectedFile.language}</span>
            <span>{selectedFile.path}</span>
            {selectedFile.kind === "text" ? (
              <>
                <span>{selectedFile.content.split("\n").length} lines</span>
                <span>{selectedFile.content.length} chars</span>
              </>
            ) : null}
          </div>

          {selectedFile.kind === "image" ? (
            <div className="image-viewer">
              <img className="image-preview" src={selectedFile.content} alt={selectedFile.name} />
            </div>
          ) : (
            <textarea
              className="code-editor"
              value={selectedFile.content}
              onChange={(event) => onUpdateSelectedFileContent(event.target.value)}
              spellCheck={false}
            />
          )}
        </>
      ) : (
        <div className="empty-editor">
          <p>まずコードファイルをアップロードしてください。</p>
        </div>
      )}
    </section>
  );
}
