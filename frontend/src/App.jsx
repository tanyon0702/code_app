import { useEffect, useRef, useState } from "react";
import AppHeader from "./components/AppHeader";
import AssistantModal from "./components/AssistantModal";
import ChatModal from "./components/ChatModal";
import ContextMenu from "./components/ContextMenu";
import EditorPanel from "./components/EditorPanel";
import ProjectFixComposerModal from "./components/ProjectFixComposerModal";
import ProjectSidebar from "./components/ProjectSidebar";
import ProjectTabs from "./components/ProjectTabs";
import RuntimeSettingsModal from "./components/RuntimeSettingsModal";
import SavedProjectsModal from "./components/SavedProjectsModal";
import { useAssistantTools } from "./hooks/useAssistantTools";
import { useChatState } from "./hooks/useChatState";
import { useRuntimeSettings } from "./hooks/useRuntimeSettings";
import { useWorkspaceState } from "./hooks/useWorkspaceState";
import { downloadTextFile } from "./utils/fileUtils";

export default function App() {
  const [status, setStatus] = useState("ファイルを追加してください");
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, items: [], title: "" });
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const inputRef = useRef(null);

  const workspace = useWorkspaceState(setStatus);
  const chat = useChatState(setStatus, workspace.selectedFile);
  const runtime = useRuntimeSettings(setStatus);
  const tools = useAssistantTools({
    selectedProject: workspace.selectedProject,
    selectedFile: workspace.selectedFile,
    patchSelectedProject: workspace.patchSelectedProject,
    savedSnapshots: workspace.savedSnapshots,
    setStatus,
  });

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        setContextMenu((current) => ({ ...current, open: false }));
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  function closeContextMenu() {
    setContextMenu((current) => ({ ...current, open: false }));
  }

  function openProjectContextMenu(event, project) {
    setContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      title: "Project",
      items: [
        {
          label: "Rename Project",
          onSelect: () => workspace.startProjectRename(project),
        },
        {
          label: "Delete Project",
          onSelect: () => workspace.removeProject(project.id),
          danger: true,
          disabled: workspace.projects.length <= 1,
        },
      ],
    });
  }

  function openFolderContextMenu(event, folderPath, toolBusy) {
    setContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      title: "Folder",
      items: [
        {
          label: "New File",
          onSelect: () => {
            workspace.selectFolder(folderPath);
            workspace.createEmptyFile();
          },
        },
        {
          label: "New Folder",
          onSelect: () => {
            workspace.selectFolder(folderPath);
            workspace.createFolder();
          },
        },
        {
          label: "Rename",
          onSelect: () => {
            workspace.selectFolder(folderPath);
            workspace.renameSelectedNode();
          },
        },
        {
          label: "Project Fix Here",
          onSelect: () => {
            workspace.selectFolder(folderPath);
            tools.openProjectFixComposer();
          },
          disabled: toolBusy,
        },
        {
          label: "Delete Folder",
          onSelect: () => workspace.removeFolder(folderPath),
          danger: true,
        },
      ],
    });
  }

  function openFileContextMenu(event, file, toolBusy) {
    setContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      title: "File",
      items: [
        {
          label: "Rename",
          onSelect: () => {
            workspace.selectFile(file.id, file.path);
            workspace.renameSelectedNode();
          },
        },
        {
          label: "Delete",
          onSelect: () => workspace.removeFile(file.id),
          danger: true,
        },
        {
          label: "Complete",
          onSelect: () => {
            workspace.selectFile(file.id, file.path);
            setStatus("補完はエディタ上で Complete ボタンか Ctrl+Space を使ってください");
          },
          disabled: file.kind !== "text" || toolBusy,
        },
        {
          label: "Fix",
          onSelect: () => {
            workspace.selectFile(file.id, file.path);
            tools.openFileFixComposer(file);
          },
          disabled: file.kind !== "text" || toolBusy,
        },
        {
          label: "Feedback",
          onSelect: () => {
            workspace.selectFile(file.id, file.path);
            tools.runCodeAction("advice", { targetFile: file });
          },
          disabled: file.kind !== "text" || toolBusy,
        },
        {
          label: "Explain",
          onSelect: () => {
            workspace.selectFile(file.id, file.path);
            tools.runCodeAction("explain", { targetFile: file });
          },
          disabled: file.kind !== "text" || toolBusy,
        },
      ],
    });
  }

  return (
    <div
      className={`app-shell ${workspace.dragActive ? "drag-active" : ""}`}
      onClick={() => {
        workspace.setAppMenuOpen(false);
        setAiMenuOpen(false);
        closeContextMenu();
      }}
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
      <AppHeader
        appMenuOpen={workspace.appMenuOpen}
        aiMenuOpen={aiMenuOpen}
        toolBusy={tools.toolBusy}
        hasProjectFiles={workspace.files.length > 0}
        onToggleAppMenu={() => {
          setAiMenuOpen(false);
          workspace.setAppMenuOpen((current) => !current);
        }}
        onToggleAiMenu={() => {
          workspace.setAppMenuOpen(false);
          setAiMenuOpen((current) => !current);
        }}
        onOpenRuntimeSettings={() => {
          workspace.setAppMenuOpen(false);
          runtime.openRuntimeSettings();
        }}
        onOpenSavedProjects={() => workspace.setSavedProjectsOpen(true)}
        onCreateProject={workspace.createNewProject}
        onOpenProjectFixComposer={() => {
          setAiMenuOpen(false);
          tools.openProjectFixComposer();
        }}
        onRunProjectAdvice={() => {
          setAiMenuOpen(false);
          tools.runProjectAction("advice");
        }}
        onRunProjectExplain={() => {
          setAiMenuOpen(false);
          tools.runProjectAction("explain");
        }}
        onOpenChat={(event) => {
          event?.stopPropagation?.();
          chat.setChatOpen(true);
        }}
        onOpenFilePicker={() => inputRef.current?.click()}
        onOpenFolderPicker={() => document.getElementById("folder-input")?.click()}
        inputRef={inputRef}
        onFileUpload={workspace.handleFileUpload}
        projectTabs={(
          <ProjectTabs
            projects={workspace.projects}
            selectedProjectId={workspace.selectedProjectId}
            editingProjectId={workspace.editingProjectId}
            editingProjectName={workspace.editingProjectName}
            onCreateProject={workspace.createNewProject}
            onSelectProject={workspace.setSelectedProjectId}
            onStartRenameProject={workspace.startProjectRename}
            onChangeEditingProjectName={workspace.setEditingProjectName}
            onCommitProjectRename={workspace.commitProjectRename}
            onCancelProjectRename={workspace.cancelProjectRename}
            onRemoveProject={workspace.removeProject}
            onOpenProjectContextMenu={openProjectContextMenu}
          />
        )}
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
          onOpenFolderContextMenu={openFolderContextMenu}
          onOpenFileContextMenu={openFileContextMenu}
          onUpdateEditingNodeDraft={workspace.updateEditingNodeDraft}
          onCommitEditingNode={workspace.commitEditingNode}
          onCancelEditingNode={workspace.cancelEditingNode}
        />

        <EditorPanel
          selectedFile={workspace.selectedFile}
          toolBusy={tools.toolBusy}
          onLoadCurrentCodeIntoChat={chat.loadCurrentCodeIntoChat}
          onRunFix={() => tools.openFileFixComposer()}
          onRunAdvice={() => tools.runCodeAction("advice")}
          onRunExplain={() => tools.runCodeAction("explain")}
          onRequestCompletion={tools.requestCodeCompletion}
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
        mode="file"
        open={tools.fileFixComposer.open}
        instruction={tools.fileFixComposer.instruction}
        onClose={() => tools.setFileFixComposer({ open: false, instruction: "", targetFile: null })}
        onChangeInstruction={(value) =>
          tools.setFileFixComposer((current) => ({ ...current, instruction: value }))
        }
        onSubmit={tools.submitFileFixComposer}
      />

      <ProjectFixComposerModal
        mode="project"
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

      <RuntimeSettingsModal
        open={runtime.runtimeOpen}
        loading={runtime.loading}
        saving={runtime.saving}
        error={runtime.error}
        current={runtime.current}
        models={runtime.models}
        selectedModel={runtime.selectedModel}
        form={runtime.form}
        estimate={runtime.estimate}
        estimateBusy={runtime.estimateBusy}
        onClose={() => runtime.setRuntimeOpen(false)}
        onChangeForm={(patch) => runtime.setForm((current) => ({ ...current, ...patch }))}
        onApply={runtime.applyRuntimeSettings}
        onLoadNow={() => runtime.applyRuntimeSettings(true)}
      />

      <ContextMenu menu={contextMenu} onClose={closeContextMenu} />
    </div>
  );
}
