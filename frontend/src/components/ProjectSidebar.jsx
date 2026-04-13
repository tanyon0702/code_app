import { getFileIcon } from "../utils/fileUtils";

function TreeNodeList({
  nodes,
  depth,
  selectedProject,
  collapsedFolders,
  editingNode,
  toolBusy,
  onSelectFolder,
  onToggleFolder,
  onSelectFile,
  onRemoveFile,
  onOpenFolderContextMenu,
  onOpenFileContextMenu,
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
            onContextMenu={(event) => {
              event.preventDefault();
              onSelectFolder(node.path);
              onOpenFolderContextMenu(event, node.path, toolBusy);
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
              toolBusy={toolBusy}
              onSelectFolder={onSelectFolder}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
              onRemoveFile={onRemoveFile}
              onOpenFolderContextMenu={onOpenFolderContextMenu}
              onOpenFileContextMenu={onOpenFileContextMenu}
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
          onContextMenu={(event) => {
            event.preventDefault();
            onSelectFile(file.id, file.path);
            onOpenFileContextMenu(event, file, toolBusy);
          }}
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
            onMouseDown={(event) => event.stopPropagation()}
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
    onCreateEmptyFile,
    onCreateFolder,
    onRenameSelectedNode,
    onDownloadProjectArchive,
    onSelectFolder,
    onToggleFolder,
    onSelectFile,
    onRemoveFile,
    onOpenFolderContextMenu,
    onOpenFileContextMenu,
    onUpdateEditingNodeDraft,
    onCommitEditingNode,
    onCancelEditingNode,
  } = props;

  return (
    <aside className="panel file-panel explorer-panel">
      <div className="panel-header explorer-header">
        <div>
          <p className="panel-kicker">Explorer</p>
          <h2>{selectedProject?.name ?? "Project"}</h2>
        </div>
        <span className="subtle-pill">{files.length}</span>
      </div>

      <div className="explorer-actions">
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
          Rename
        </button>
        <button
          className="ghost-button compact"
          onClick={onDownloadProjectArchive}
          disabled={files.length === 0}
        >
          ZIP
        </button>
      </div>

      <div className="file-list tree-list explorer-tree">
        {files.length === 0 ? (
          <div className="empty-state">アップロードしたファイルがここに表示されます。</div>
        ) : null}

        <TreeNodeList
          nodes={fileTree}
          depth={0}
          selectedProject={selectedProject}
          collapsedFolders={collapsedFolders}
          editingNode={editingNode}
          toolBusy={toolBusy}
          onSelectFolder={onSelectFolder}
          onToggleFolder={onToggleFolder}
          onSelectFile={onSelectFile}
          onRemoveFile={onRemoveFile}
          onOpenFolderContextMenu={onOpenFolderContextMenu}
          onOpenFileContextMenu={onOpenFileContextMenu}
          onUpdateEditingNodeDraft={onUpdateEditingNodeDraft}
          onCommitEditingNode={onCommitEditingNode}
          onCancelEditingNode={onCancelEditingNode}
        />
      </div>
    </aside>
  );
}
