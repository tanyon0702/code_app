function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function SavedProjectsModal({
  open,
  snapshots,
  onClose,
  onSaveCurrent,
  onLoadSnapshot,
  onExportSnapshot,
  onDeleteSnapshot,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="chat-modal-backdrop" onClick={onClose}>
      <section className="prompt-modal panel saved-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Saved Projects</p>
            <h2>アプリ内保存</h2>
          </div>
          <div className="action-cluster">
            <button className="primary-button" onClick={onSaveCurrent}>
              Save Current
            </button>
            <button className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <p className="prompt-copy">
          ここに保存したスナップショットを読み込み、書き出し、削除できます。
        </p>

        <div className="saved-list">
          {snapshots.length === 0 ? (
            <div className="empty-state">まだ保存されたスナップショットはありません。</div>
          ) : null}

          {snapshots.map((snapshot) => (
            <article key={snapshot.id} className="saved-item">
              <div className="saved-item-main">
                <strong>{snapshot.name}</strong>
                <span>{formatDate(snapshot.createdAt)}</span>
                <span>{snapshot.projects.length} project(s)</span>
              </div>
              <div className="control-buttons">
                <button className="ghost-button compact" onClick={() => onLoadSnapshot(snapshot.id)}>
                  Load
                </button>
                <button className="ghost-button compact" onClick={() => onExportSnapshot(snapshot.id)}>
                  Export
                </button>
                <button className="ghost-button compact" onClick={() => onDeleteSnapshot(snapshot.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
