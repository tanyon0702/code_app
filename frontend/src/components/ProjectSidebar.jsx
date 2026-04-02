import { getFileIcon } from "../utils/fileUtils";

function TreeNodeList({
  nodes,
  depth,
  selectedProject,
  collapsedFolders,
  editingNode,
  onSelectFolder,
  onToggleFolder,
  onSelectFile,
  onRemoveFile,
  onUpdateEditingNodeDraft,
  onCommitEditingNode,
  onCancelEditingNode,
}) {
  const rendered = nodes.map((node) => {
    if (node.type === "folder") {
      const collapsed = Boolean(collapsedFolders[node.path]);

      return (
        <div key={node.id} className="tree-node">
          <button
            className="tree-row folder-row"
            data-selected={selectedProject?.selectedNodeType === "folder" && selectedProject?.selectedNodePath === node.path}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => {
              onSelectFolder(node.path);
              onToggleFolder(node.path);
            }}
          >
            <span className="tree-caret">{collapsed ? "▸" : "▾"}</span>
            <span className="tree-icon">📁</span>
            {editingNode?.type === "folder" && editingNode.path === node.path ? (
              <input
                className="tree-inline-input"
                value={editingNode.draft}
                autoFocus
                onChange={(event) => onUpdateEditingNodeDraft(event.target.value)}
                onBlur={onCommitEditingNode}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onCommitEditingNode();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onCancelEditingNode();
                  }
                }}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <span className="tree-label">{node.name}</span>
            )}
          </button>

          {!collapsed ? (
            <TreeNodeList
              nodes={node.children}
              depth={depth + 1}
              selectedProject={selectedProject}
              collapsedFolders={collapsedFolders}
              editingNode={editingNode}
              onSelectFolder={onSelectFolder}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
              onRemoveFile={onRemoveFile}
              onUpdateEditingNodeDraft={onUpdateEditingNodeDraft}
              onCommitEditingNode={onCommitEditingNode}
              onCancelEditingNode={onCancelEditingNode}
            />
          ) : null}
        </div>
      );
    }

    const file = node.file;
    return (
      <div key={node.id} className="tree-node">
        <button
          className={`tree-row file-row ${selectedProject?.selectedFileId === file.id ? "selected" : ""}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => onSelectFile(file.id, file.path)}
        >
          <span className="tree-caret tree-caret-placeholder">•</span>
          <span className="tree-icon">{getFileIcon(file)}</span>
          {editingNode?.type === "file" && editingNode.path === file.path ? (
            <input
              className="tree-inline-input"
              value={editingNode.draft}
              autoFocus
              onChange={(event) => onUpdateEditingNodeDraft(event.target.value)}
              onBlur={onCommitEditingNode}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitEditingNode();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelEditingNode();
                }
              }}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="tree-label">{file.name}</span>
          )}
          <span className="tree-meta">{file.kind === "image" ? "image" : file.language}</span>
          <span
            className="file-remove"
            onClick={(event) => {
              event.stopPropagation();
              onRemoveFile(file.id);
            }}
          >
            Remove
          </span>
        </button>
      </div>
    );
  });

  if (
    editingNode &&
    editingNode.mode.startsWith("create-") &&
    depth === (editingNode.parentPath ? editingNode.parentPath.split("/").length : 0)
  ) {
    rendered.push(
      <div key={editingNode.path} className="tree-node">
        <div className="tree-row file-row creating-row" style={{ paddingLeft: `${12 + depth * 16}px` }}>
          <span className="tree-caret tree-caret-placeholder">•</span>
          <span className="tree-icon">{editingNode.type === "folder" ? "📁" : "📄"}</span>
          <input
            className="tree-inline-input"
            value={editingNode.draft}
            autoFocus
            onChange={(event) => onUpdateEditingNodeDraft(event.target.value)}
            onBlur={onCommitEditingNode}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCommitEditingNode();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancelEditingNode();
              }
            }}
          />
        </div>
      </div>,
    );
  }

  return rendered;
}

export default function ProjectSidebar(props) {
  const {
    selectedProject,
    files,
    fileTree,
    toolBusy,
    collapsedFolders,
    editingNode,
    onStartRenameProject,
    onCreateEmptyFile,
    onCreateFolder,
    onRenameSelectedNode,
    onDownloadProjectArchive,
    onOpenProjectFixComposer,
    onRunProjectAdvice,
    onRunProjectExplain,
    onSelectFolder,
    onToggleFolder,
    onSelectFile,
    onRemoveFile,
    onUpdateEditingNodeDraft,
    onCommitEditingNode,
    onCancelEditingNode,
  } = props;

  return (
    <aside className="panel file-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Project</p>
          <h2>{selectedProject?.name ?? "Files"}</h2>
        </div>
        <span className="subtle-pill">{files.length} files</span>
      </div>

      <div className="project-actions">
        <div className="control-section">
          <span className="control-label">Manage</span>
          <div className="control-buttons">
            <button
              className="ghost-button compact"
              onClick={() => selectedProject && onStartRenameProject(selectedProject)}
              disabled={!selectedProject}
            >
              Rename Project
            </button>
            <button className="ghost-button compact" onClick={onCreateEmptyFile}>
              New File
            </button>
            <button className="ghost-button compact" onClick={onCreateFolder}>
              New Folder
            </button>
            <button
              className="ghost-button compact"
              onClick={onRenameSelectedNode}
              disabled={!selectedProject || selectedProject.selectedNodeType === "root"}
            >
              Rename Node
            </button>
            <button
              className="ghost-button compact"
              onClick={onDownloadProjectArchive}
              disabled={files.length === 0}
            >
              Download ZIP
            </button>
          </div>
        </div>

        <div className="control-section">
          <span className="control-label">Project AI</span>
          <div className="control-buttons">
            <button
              className="ghost-button compact accent"
              onClick={onOpenProjectFixComposer}
              disabled={files.length === 0 || toolBusy}
            >
              Project Fix
            </button>
            <button
              className="ghost-button compact"
              onClick={onRunProjectAdvice}
              disabled={files.length === 0 || toolBusy}
            >
              Feedback
            </button>
            <button
              className="ghost-button compact"
              onClick={onRunProjectExplain}
              disabled={files.length === 0 || toolBusy}
            >
              Explain
            </button>
          </div>
        </div>
      </div>

      <div className="file-list tree-list">
        {files.length === 0 ? (
          <div className="empty-state">アップロードしたファイルがここに表示されます。</div>
        ) : null}

        <TreeNodeList
          nodes={fileTree}
          depth={0}
          selectedProject={selectedProject}
          collapsedFolders={collapsedFolders}
          editingNode={editingNode}
          onSelectFolder={onSelectFolder}
          onToggleFolder={onToggleFolder}
          onSelectFile={onSelectFile}
          onRemoveFile={onRemoveFile}
          onUpdateEditingNodeDraft={onUpdateEditingNodeDraft}
          onCommitEditingNode={onCommitEditingNode}
          onCancelEditingNode={onCancelEditingNode}
        />
      </div>
    </aside>
  );
}
