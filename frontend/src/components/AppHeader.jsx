export default function AppHeader({
  status,
  toolBusy,
  appMenuOpen,
  onToggleAppMenu,
  onOpenSavedProjects,
  onCreateProject,
  onOpenChat,
  onOpenFilePicker,
  onOpenFolderPicker,
  inputRef,
  onFileUpload,
}) {
  return (
    <header className="topbar">
      <div className="topbar-leading">
        <div className="menu-anchor">
          <button
            className={`menu-button ${appMenuOpen ? "open" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleAppMenu();
            }}
          >
            <span />
            <span />
            <span />
          </button>

          {appMenuOpen ? (
            <div className="app-menu panel" onClick={(event) => event.stopPropagation()}>
              <p className="panel-kicker">App Menu</p>
              <div className="control-section inline menu-section">
                <span className="control-label">Project</span>
                <div className="control-buttons">
                  <button className="ghost-button compact" onClick={onOpenSavedProjects}>
                    Saves
                  </button>
                  <button className="ghost-button compact" onClick={onCreateProject}>
                    New Project
                  </button>
                </div>
              </div>
              <div className="control-section inline menu-section">
                <span className="control-label">Import</span>
                <div className="control-buttons">
                  <button className="ghost-button compact" onClick={onOpenFilePicker}>
                    Upload Files
                  </button>
                  <button className="ghost-button compact" onClick={onOpenFolderPicker}>
                    Upload Folder
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="hero-block">
          <p className="eyebrow">Local LLM Code Assistant</p>
          <h1>Fix, Review, Explain</h1>
        </div>
      </div>

      <div className="topbar-controls">
        <span className={`status-pill ${toolBusy ? "live" : ""}`}>{status}</span>
      </div>

      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        multiple
        onChange={onFileUpload}
      />
      <input
        id="folder-input"
        className="hidden-input"
        type="file"
        multiple
        webkitdirectory="true"
        directory="true"
        onChange={onFileUpload}
      />

      <button className="chat-fab" onClick={onOpenChat} aria-label="Open chat">
        <span className="chat-fab-icon">💬</span>
      </button>
    </header>
  );
}
