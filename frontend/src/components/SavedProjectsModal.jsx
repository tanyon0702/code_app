import { useState } from "react";

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
  const [expandedExportId, setExpandedExportId] = useState(null);

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
          ここに保存したスナップショットを読み込み、JSON または ZIP で書き出し、削除できます。
        </p>

        <div className="saved-list">
          {snapshots.length === 0 ? (
            <div className="empty-state">まだ保存されたスナップショットはありません。</div>
          ) : null}

          {snapshots.map((snapshot) => {
            const exportOpen = expandedExportId === snapshot.id;
            return (
              <article key={snapshot.id} className="saved-item">
                <div className="saved-item-main">
                  <strong>{snapshot.name}</strong>
                  <span>{formatDate(snapshot.createdAt)}</span>
                  <span>{snapshot.projects.length} project(s)</span>
                </div>
                <div className="saved-item-actions">
                  <div className="control-buttons">
                    <button className="ghost-button compact" onClick={() => onLoadSnapshot(snapshot.id)}>
                      Load
                    </button>
                    <div className="saved-export-anchor">
                      <button
                        className="ghost-button compact"
                        onClick={() => setExpandedExportId((current) => (current === snapshot.id ? null : snapshot.id))}
                      >
                        Export
                      </button>
                      {exportOpen ? (
                        <div className="saved-export-menu panel">
                          <button
                            className="ghost-button compact"
                            onClick={() => {
                              onExportSnapshot(snapshot.id, "json");
                              setExpandedExportId(null);
                            }}
                          >
                            JSON
                          </button>
                          <button
                            className="ghost-button compact"
                            onClick={() => {
                              onExportSnapshot(snapshot.id, "zip");
                              setExpandedExportId(null);
                            }}
                          >
                            ZIP
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <button className="ghost-button compact" onClick={() => onDeleteSnapshot(snapshot.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
