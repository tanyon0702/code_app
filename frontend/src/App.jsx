import { useRef, useState } from "react";
import AppHeader from "./components/AppHeader";
import AssistantModal from "./components/AssistantModal";
import ChatModal from "./components/ChatModal";
import EditorPanel from "./components/EditorPanel";
import ProjectFixComposerModal from "./components/ProjectFixComposerModal";
import ProjectSidebar from "./components/ProjectSidebar";
import ProjectTabs from "./components/ProjectTabs";
import SavedProjectsModal from "./components/SavedProjectsModal";
import { useAssistantTools } from "./hooks/useAssistantTools";
import { useChatState } from "./hooks/useChatState";
import { useWorkspaceState } from "./hooks/useWorkspaceState";
import { downloadTextFile } from "./utils/fileUtils";

export default function App() {
  const [status, setStatus] = useState("ファイルを追加してください");
  const inputRef = useRef(null);

  const workspace = useWorkspaceState(setStatus);
  const chat = useChatState(setStatus, workspace.selectedFile);
  const tools = useAssistantTools({
    selectedProject: workspace.selectedProject,
    selectedFile: workspace.selectedFile,
    patchSelectedProject: workspace.patchSelectedProject,
    savedSnapshots: workspace.savedSnapshots,
    setStatus,
  });

  return (
    <div
      className={`app-shell ${workspace.dragActive ? "drag-active" : ""}`}
      onClick={() => workspace.setAppMenuOpen(false)}
      onDragEnter={(event) => {
        event.preventDefault();
        workspace.setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        workspace.setDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget === event.target) {
          workspace.setDragActive(false);
        }
      }}
      onDrop={workspace.handleDrop}
    >
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />

      <AppHeader
        status={status}
        toolBusy={tools.toolBusy}
        appMenuOpen={workspace.appMenuOpen}
        onToggleAppMenu={() => workspace.setAppMenuOpen((current) => !current)}
        onOpenSavedProjects={() => workspace.setSavedProjectsOpen(true)}
        onCreateProject={workspace.createNewProject}
        onOpenChat={(event) => {
          event?.stopPropagation?.();
          chat.setChatOpen(true);
        }}
        onOpenFilePicker={() => inputRef.current?.click()}
        onOpenFolderPicker={() => document.getElementById("folder-input")?.click()}
        inputRef={inputRef}
        onFileUpload={workspace.handleFileUpload}
      />

      <ProjectTabs
        projects={workspace.projects}
        selectedProjectId={workspace.selectedProjectId}
        editingProjectId={workspace.editingProjectId}
        editingProjectName={workspace.editingProjectName}
        onSelectProject={workspace.setSelectedProjectId}
        onStartRenameProject={workspace.startProjectRename}
        onChangeEditingProjectName={workspace.setEditingProjectName}
        onCommitProjectRename={workspace.commitProjectRename}
        onCancelProjectRename={workspace.cancelProjectRename}
        onRemoveProject={workspace.removeProject}
      />

      <main className="workspace-grid code-layout">
        <ProjectSidebar
          selectedProject={workspace.selectedProject}
          files={workspace.files}
          fileTree={workspace.fileTree}
          toolBusy={tools.toolBusy}
          collapsedFolders={workspace.collapsedFolders}
          editingNode={workspace.editingNode}
          onStartRenameProject={workspace.startProjectRename}
          onCreateEmptyFile={workspace.createEmptyFile}
          onCreateFolder={workspace.createFolder}
          onRenameSelectedNode={workspace.renameSelectedNode}
          onDownloadProjectArchive={tools.downloadProjectArchive}
          onOpenProjectFixComposer={tools.openProjectFixComposer}
          onRunProjectAdvice={() => tools.runProjectAction("advice")}
          onRunProjectExplain={() => tools.runProjectAction("explain")}
          onSelectFolder={workspace.selectFolder}
          onToggleFolder={workspace.toggleFolder}
          onSelectFile={workspace.selectFile}
          onRemoveFile={workspace.removeFile}
          onUpdateEditingNodeDraft={workspace.updateEditingNodeDraft}
          onCommitEditingNode={workspace.commitEditingNode}
          onCancelEditingNode={workspace.cancelEditingNode}
        />

        <EditorPanel
          selectedFile={workspace.selectedFile}
          toolBusy={tools.toolBusy}
          onLoadCurrentCodeIntoChat={chat.loadCurrentCodeIntoChat}
          onRunFix={() => tools.runCodeAction("fix")}
          onRunAdvice={() => tools.runCodeAction("advice")}
          onRunExplain={() => tools.runCodeAction("explain")}
          onDownloadSelectedFile={() =>
            workspace.selectedFile &&
            downloadTextFile(workspace.selectedFile.name, workspace.selectedFile.content)
          }
          onUpdateSelectedFileContent={workspace.updateSelectedFileContent}
        />
      </main>

      {workspace.dragActive ? (
        <div className="drop-overlay">
          <div className="drop-card">
            <p className="panel-kicker">Drop Files</p>
            <h2>ここにコードファイルをドロップ</h2>
            <p>複数ファイルをまとめて追加できます。</p>
          </div>
        </div>
      ) : null}

      <AssistantModal
        toolModal={tools.toolModal}
        onClose={tools.closeToolModal}
        fixPreview={tools.fixPreview}
        selectedFile={workspace.selectedFile}
        onApplyFix={() => tools.applyFix(workspace.updateSelectedFileContent)}
        onDownloadFixed={downloadTextFile}
        projectFixPreview={tools.projectFixPreview}
        projectFixDiffs={tools.projectFixDiffs}
        onApplyProjectFix={tools.applyProjectFix}
      />

      <ProjectFixComposerModal
        open={tools.projectFixComposer.open}
        instruction={tools.projectFixComposer.instruction}
        onClose={() => tools.setProjectFixComposer({ open: false, instruction: "" })}
        onChangeInstruction={(value) =>
          tools.setProjectFixComposer((current) => ({ ...current, instruction: value }))
        }
        onSubmit={tools.submitProjectFixComposer}
      />

      <ChatModal
        open={chat.chatOpen}
        chatContext={chat.chatContext}
        chatMessages={chat.chatMessages}
        chatInput={chat.chatInput}
        chatBusy={chat.chatBusy}
        chatBodyRef={chat.chatBodyRef}
        selectedFile={workspace.selectedFile}
        onClose={() => chat.setChatOpen(false)}
        onLoadCurrentCodeIntoChat={chat.loadCurrentCodeIntoChat}
        onChangeChatInput={chat.setChatInput}
        onClearChat={chat.clearChat}
        onSendChatMessage={chat.sendChatMessage}
      />

      <SavedProjectsModal
        open={workspace.savedProjectsOpen}
        snapshots={workspace.savedSnapshots}
        onClose={() => workspace.setSavedProjectsOpen(false)}
        onSaveCurrent={workspace.saveCurrentSnapshot}
        onLoadSnapshot={(snapshotId) => {
          workspace.loadSnapshot(snapshotId);
          chat.resetChatState();
        }}
        onExportSnapshot={tools.exportSnapshot}
        onDeleteSnapshot={workspace.deleteSnapshot}
      />
    </div>
  );
}
