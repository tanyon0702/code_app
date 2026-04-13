export default function AppHeader({
  appMenuOpen,
  aiMenuOpen,
  toolBusy,
  hasProjectFiles,
  onToggleAppMenu,
  onToggleAiMenu,
  onOpenRuntimeSettings,
  onOpenSavedProjects,
  onCreateProject,
  onOpenProjectFixComposer,
  onRunProjectAdvice,
  onRunProjectExplain,
  onOpenChat,
  onOpenFilePicker,
  onOpenFolderPicker,
  inputRef,
  onFileUpload,
  projectTabs,
}) {
  return (
    <header className="page-header">
      <div className="app-toolbar">
        <div className="toolbar-side toolbar-side-left">
          <div className="menu-anchor">
            <button
              className={`menu-button ${appMenuOpen ? "open" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleAppMenu();
              }}
              aria-label="Open app menu"
            >
              <span />
              <span />
              <span />
            </button>

            {appMenuOpen ? (
              <div className="app-menu panel" onClick={(event) => event.stopPropagation()}>
                <p className="panel-kicker">App Menu</p>
                <div className="control-section inline menu-section">
                  <span className="control-label">Runtime</span>
                  <div className="control-buttons">
                    <button className="ghost-button compact" onClick={onOpenRuntimeSettings}>
                      Models
                    </button>
                  </div>
                </div>
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
        </div>

        <div className="toolbar-center">{projectTabs}</div>

        <div className="toolbar-side toolbar-side-right">
          <div className="menu-anchor">
            <button
              className={`ghost-button toolbar-ai-button ${aiMenuOpen ? "open" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleAiMenu();
              }}
              aria-label="Open AI actions"
            >
              AI
            </button>

            {aiMenuOpen ? (
              <div className="app-menu panel ai-menu" onClick={(event) => event.stopPropagation()}>
                <p className="panel-kicker">AI Actions</p>
                <div className="control-section inline menu-section">
                  <span className="control-label">Project AI</span>
                  <div className="control-buttons vertical">
                    <button
                      className="ghost-button compact accent"
                      onClick={onOpenProjectFixComposer}
                      disabled={!hasProjectFiles || toolBusy}
                    >
                      Project Fix
                    </button>
                    <button
                      className="ghost-button compact"
                      onClick={onRunProjectAdvice}
                      disabled={!hasProjectFiles || toolBusy}
                    >
                      Feedback
                    </button>
                    <button
                      className="ghost-button compact"
                      onClick={onRunProjectExplain}
                      disabled={!hasProjectFiles || toolBusy}
                    >
                      Explain
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
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
