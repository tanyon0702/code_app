import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "./components/AppHeader";
import AssistantModal from "./components/AssistantModal";
import ChatModal from "./components/ChatModal";
import EditorPanel from "./components/EditorPanel";
import ProjectFixComposerModal from "./components/ProjectFixComposerModal";
import ProjectSidebar from "./components/ProjectSidebar";
import ProjectTabs from "./components/ProjectTabs";
import { buildProjectFixDiffs } from "./utils/diffUtils";
import {
  buildFileTree,
  downloadTextFile,
  getBaseName,
  getParentPath,
  inferFileKind,
  inferLanguage,
  joinPath,
  parseProjectFixResult,
  readFileAsDataUrl,
  readFileAsText,
} from "./utils/fileUtils";
import {
  createProject,
  loadStoredState,
  saveStoredState,
} from "./utils/projectStorage";
import { readNdjsonStream } from "./utils/streamUtils";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8001";

const INITIAL_CHAT_MESSAGE = {
  id: globalThis.crypto?.randomUUID?.() ?? "chat-welcome",
  role: "assistant",
  content: "質問を入力してください。必要なら先に現在のコードを読み込ませられます。",
};

export default function App() {
  const storedState = useMemo(() => loadStoredState(), []);

  const [projects, setProjects] = useState(storedState.projects);
  const [selectedProjectId, setSelectedProjectId] = useState(storedState.selectedProjectId);
  const [status, setStatus] = useState("ファイルを追加してください");
  const [toolBusy, setToolBusy] = useState(false);
  const [toolModal, setToolModal] = useState({ open: false, mode: "", title: "", content: "" });
  const [fixPreview, setFixPreview] = useState("");
  const [projectFixPreview, setProjectFixPreview] = useState([]);
  const [projectFixDiffs, setProjectFixDiffs] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState({});
  const [editingNode, setEditingNode] = useState(null);
  const [projectFixComposer, setProjectFixComposer] = useState({ open: false, instruction: "" });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([INITIAL_CHAT_MESSAGE]);
  const [chatContext, setChatContext] = useState(null);
  const inputRef = useRef(null);
  const chatBodyRef = useRef(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const files = selectedProject?.files ?? [];
  const folders = selectedProject?.folders ?? [];
  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedProject?.selectedFileId) ?? null,
    [files, selectedProject],
  );
  const fileTree = useMemo(() => buildFileTree(files, folders), [files, folders]);

  useEffect(() => {
    saveStoredState(projects, selectedProjectId);
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId && projects[0]?.id) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  function closeToolModal() {
    setToolModal({ open: false, mode: "", title: "", content: "" });
  }

  function patchSelectedProject(updater) {
    setProjects((current) =>
      current.map((project) => (project.id === selectedProjectId ? updater(project) : project)),
    );
  }

  function createNewProject() {
    const project = createProject(`Project ${projects.length + 1}`);
    setProjects((current) => [...current, project]);
    setSelectedProjectId(project.id);
    setStatus(`Created ${project.name}`);
  }

  function startProjectRename(project) {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
  }

  function commitProjectRename() {
    const nextName = editingProjectName.trim();
    if (!editingProjectId || !nextName) {
      setEditingProjectId(null);
      setEditingProjectName("");
      return;
    }

    setProjects((current) =>
      current.map((project) =>
        project.id === editingProjectId ? { ...project, name: nextName } : project,
      ),
    );
    setStatus(`Renamed project to ${nextName}`);
    setEditingProjectId(null);
    setEditingProjectName("");
  }

  function cancelProjectRename() {
    setEditingProjectId(null);
    setEditingProjectName("");
  }

  function saveProjectsToApp() {
    saveStoredState(projects, selectedProjectId);
    setStatus("アプリ内に保存しました");
  }

  function removeProject(projectId) {
    setProjects((current) => {
      if (current.length === 1) {
        return current;
      }
      const remaining = current.filter((project) => project.id !== projectId);
      if (selectedProjectId === projectId) {
        setSelectedProjectId(remaining[0]?.id ?? "");
      }
      return remaining;
    });
  }

  async function loadFiles(uploadedFiles) {
    if (!selectedProject || uploadedFiles.length === 0) {
      return;
    }

    const loadedFiles = await Promise.all(
      uploadedFiles.map(async (file) => {
        const kind = inferFileKind(file.name);
        const relativePath = file.webkitRelativePath?.replace(/\\/g, "/") || file.name;

        return {
          id: globalThis.crypto?.randomUUID?.() ?? `${file.name}-${Date.now()}`,
          name: getBaseName(relativePath),
          path: relativePath,
          kind,
          content: kind === "image" ? await readFileAsDataUrl(file) : await readFileAsText(file),
          language: kind === "image" ? "image" : inferLanguage(file.name),
        };
      }),
    );

    patchSelectedProject((project) => ({
      ...project,
      files: [...project.files, ...loadedFiles],
      selectedFileId: project.selectedFileId ?? loadedFiles[0].id,
      folders: Array.from(
        new Set([
          ...project.folders,
          ...loadedFiles.map((file) => getParentPath(file.path)).filter(Boolean),
        ]),
      ),
      selectedNodePath: project.selectedNodePath || loadedFiles[0].path,
      selectedNodeType: project.selectedNodeType === "root" ? "file" : project.selectedNodeType,
    }));
    setStatus(`${loadedFiles.length} file(s) loaded into ${selectedProject.name}`);
  }

  async function handleFileUpload(event) {
    const uploadedFiles = Array.from(event.target.files ?? []);
    await loadFiles(uploadedFiles);
    event.target.value = "";
  }

  async function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
    await loadFiles(droppedFiles);
  }

  function updateSelectedFileContent(nextContent) {
    if (!selectedFile) {
      return;
    }

    patchSelectedProject((project) => ({
      ...project,
      files: project.files.map((file) =>
        file.id === selectedFile.id ? { ...file, content: nextContent } : file,
      ),
    }));
  }

  function removeFile(fileId) {
    patchSelectedProject((project) => {
      const remaining = project.files.filter((file) => file.id !== fileId);
      return {
        ...project,
        files: remaining,
        selectedFileId: project.selectedFileId === fileId ? (remaining[0]?.id ?? null) : project.selectedFileId,
        selectedNodePath:
          project.selectedFileId === fileId ? (remaining[0]?.path ?? project.selectedNodePath) : project.selectedNodePath,
        selectedNodeType:
          project.selectedFileId === fileId ? (remaining[0] ? "file" : project.selectedNodeType) : project.selectedNodeType,
      };
    });
  }

  function selectFolder(path) {
    patchSelectedProject((project) => ({
      ...project,
      selectedNodePath: path,
      selectedNodeType: "folder",
    }));
  }

  function toggleFolder(path) {
    setCollapsedFolders((current) => ({
      ...current,
      [path]: !current[path],
    }));
  }

  function selectFile(fileId, path) {
    patchSelectedProject((project) => ({
      ...project,
      selectedFileId: fileId,
      selectedNodePath: path,
      selectedNodeType: "file",
    }));
  }

  function getTargetFolderPath() {
    if (!selectedProject) {
      return "";
    }
    if (selectedProject.selectedNodeType === "folder") {
      return selectedProject.selectedNodePath;
    }
    if (selectedProject.selectedNodeType === "file" && selectedFile) {
      return getParentPath(selectedFile.path);
    }
    return "";
  }

  function createEmptyFile() {
    if (!selectedProject) {
      return;
    }
    setEditingNode({
      mode: "create-file",
      type: "file",
      path: "__new_file__",
      parentPath: getTargetFolderPath(),
      draft: "new_file.py",
    });
  }

  function createFolder() {
    if (!selectedProject) {
      return;
    }
    const parentPath = getTargetFolderPath();
    setCollapsedFolders((current) => ({ ...current, [parentPath]: false }));
    setEditingNode({
      mode: "create-folder",
      type: "folder",
      path: "__new_folder__",
      parentPath,
      draft: "new_folder",
    });
  }

  function renameSelectedNode() {
    if (!selectedProject || selectedProject.selectedNodeType === "root") {
      return;
    }

    if (selectedProject.selectedNodeType === "file" && selectedFile) {
      setEditingNode({
        mode: "rename-file",
        type: "file",
        path: selectedFile.path,
        parentPath: getParentPath(selectedFile.path),
        draft: selectedFile.name,
      });
      return;
    }

    if (selectedProject.selectedNodeType === "folder") {
      const currentPath = selectedProject.selectedNodePath;
      setEditingNode({
        mode: "rename-folder",
        type: "folder",
        path: currentPath,
        parentPath: getParentPath(currentPath),
        draft: getBaseName(currentPath),
      });
    }
  }

  function updateEditingNodeDraft(nextDraft) {
    setEditingNode((current) => (current ? { ...current, draft: nextDraft } : current));
  }

  function commitEditingNode() {
    if (!selectedProject || !editingNode) {
      return;
    }

    const nextName = editingNode.draft.trim();
    if (!nextName) {
      setEditingNode(null);
      return;
    }

    if (editingNode.mode === "create-file") {
      const nextPath = joinPath(editingNode.parentPath, nextName);
      if (files.some((file) => file.path === nextPath)) {
        setStatus("同名ファイルが既にあります");
        return;
      }

      const newFile = {
        id: globalThis.crypto?.randomUUID?.() ?? `file-${Date.now()}`,
        name: nextName,
        path: nextPath,
        kind: inferFileKind(nextName),
        content: "",
        language: inferLanguage(nextName),
      };

      patchSelectedProject((project) => ({
        ...project,
        files: [...project.files, newFile],
        selectedFileId: newFile.id,
        selectedNodePath: newFile.path,
        selectedNodeType: "file",
        folders: editingNode.parentPath
          ? Array.from(new Set([...project.folders, editingNode.parentPath]))
          : project.folders,
      }));
      setStatus(`Created ${nextPath}`);
      setEditingNode(null);
      return;
    }

    if (editingNode.mode === "create-folder") {
      const nextPath = joinPath(editingNode.parentPath, nextName);
      if (folders.includes(nextPath)) {
        setStatus("同名フォルダが既にあります");
        return;
      }

      patchSelectedProject((project) => ({
        ...project,
        folders: [...project.folders, nextPath],
        selectedNodePath: nextPath,
        selectedNodeType: "folder",
      }));
      setCollapsedFolders((current) => ({ ...current, [nextPath]: false }));
      setStatus(`Created folder ${nextPath}`);
      setEditingNode(null);
      return;
    }

    if (editingNode.mode === "rename-file" && selectedFile) {
      const nextPath = joinPath(editingNode.parentPath, nextName);
      if (nextName === selectedFile.name) {
        setEditingNode(null);
        return;
      }
      if (files.some((file) => file.id !== selectedFile.id && file.path === nextPath)) {
        setStatus("同名ファイルが既にあります");
        return;
      }

      patchSelectedProject((project) => ({
        ...project,
        files: project.files.map((file) =>
          file.id === selectedFile.id
            ? {
                ...file,
                name: nextName,
                path: nextPath,
                language: file.kind === "image" ? "image" : inferLanguage(nextName),
              }
            : file,
        ),
        selectedNodePath: nextPath,
      }));
      setStatus(`Renamed to ${nextPath}`);
      setEditingNode(null);
      return;
    }

    if (editingNode.mode === "rename-folder") {
      const currentPath = editingNode.path;
      const nextPath = joinPath(editingNode.parentPath, nextName);
      if (nextName === getBaseName(currentPath)) {
        setEditingNode(null);
        return;
      }
      if (folders.includes(nextPath)) {
        setStatus("同名フォルダが既にあります");
        return;
      }

      patchSelectedProject((project) => ({
        ...project,
        folders: project.folders.map((folderPath) =>
          folderPath === currentPath || folderPath.startsWith(`${currentPath}/`)
            ? folderPath.replace(currentPath, nextPath)
            : folderPath,
        ),
        files: project.files.map((file) =>
          file.path === currentPath || file.path.startsWith(`${currentPath}/`)
            ? {
                ...file,
                path: file.path.replace(currentPath, nextPath),
                name: getBaseName(file.path.replace(currentPath, nextPath)),
              }
            : file,
        ),
        selectedNodePath: nextPath,
      }));

      setCollapsedFolders((current) => {
        const next = { ...current };
        for (const key of Object.keys(current)) {
          if (key === currentPath || key.startsWith(`${currentPath}/`)) {
            const replacement = key.replace(currentPath, nextPath);
            next[replacement] = current[key];
            delete next[key];
          }
        }
        return next;
      });

      setStatus(`Renamed folder to ${nextPath}`);
      setEditingNode(null);
    }
  }

  function cancelEditingNode() {
    setEditingNode(null);
  }

  async function downloadProjectArchive() {
    if (!selectedProject || selectedProject.files.length === 0) {
      return;
    }

    try {
      setStatus("ZIP を生成中...");
      const response = await fetch(`${API_BASE}/api/project/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: selectedProject.name,
          files: selectedProject.files.map((file) => ({
            filename: file.path,
            content: file.content,
            language: file.language,
            kind: file.kind,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selectedProject.name}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus(`${selectedProject.name}.zip をダウンロードしました`);
    } catch (error) {
      setStatus("ZIP ダウンロード失敗");
      setToolModal({
        open: true,
        mode: "error",
        title: "Archive Error",
        content: error.message,
      });
    }
  }

  function buildSelectedFileContext() {
    if (!selectedFile || selectedFile.kind !== "text") {
      return null;
    }

    return {
      filename: selectedFile.name,
      path: selectedFile.path,
      language: selectedFile.language,
      content: selectedFile.content,
    };
  }

  function loadCurrentCodeIntoChat() {
    const context = buildSelectedFileContext();
    if (!context) {
      return;
    }

    setChatContext(context);
    setChatOpen(true);
    setChatMessages((current) => [
      ...current,
      {
        id: globalThis.crypto?.randomUUID?.() ?? `chat-context-${Date.now()}`,
        role: "assistant",
        content: `現在のコードを読み込みました: ${context.filename}`,
      },
    ]);
    setStatus(`${context.filename} をチャット文脈に追加`);
  }

  async function sendChatMessage() {
    const prompt = chatInput.trim();
    if (!prompt || chatBusy) {
      return;
    }

    const userMessage = {
      id: globalThis.crypto?.randomUUID?.() ?? `chat-user-${Date.now()}`,
      role: "user",
      content: prompt,
    };
    const assistantId = globalThis.crypto?.randomUUID?.() ?? `chat-assistant-${Date.now()}`;
    const nextMessages = [...chatMessages, userMessage];

    setChatMessages([...nextMessages, { id: assistantId, role: "assistant", content: "" }]);
    setChatInput("");
    setChatBusy(true);
    setStatus("チャット送信中...");

    const contextText = chatContext
      ? `ファイル名: ${chatContext.path}\n言語: ${chatContext.language}\nコード:\n${chatContext.content}`
      : "";

    try {
      const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          context: contextText,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }

      await readNdjsonStream(response, (eventData) => {
        if (eventData.type === "status") {
          setStatus(eventData.value);
          return;
        }

        if (eventData.type === "token" || eventData.type === "done") {
          setChatMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: eventData.value } : message,
            ),
          );
          return;
        }

        if (eventData.type === "error") {
          throw new Error(eventData.value);
        }
      });

      setStatus("chat completed");
    } catch (error) {
      setChatMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, content: `エラー: ${error.message}` } : message,
        ),
      );
      setStatus("エラー");
    } finally {
      setChatBusy(false);
      window.setTimeout(() => {
        chatBodyRef.current?.scrollTo({ top: chatBodyRef.current.scrollHeight, behavior: "smooth" });
      }, 0);
    }
  }

  async function runCodeAction(action) {
    if (!selectedFile || selectedFile.kind !== "text" || toolBusy) {
      return;
    }

    const instruction =
      action === "fix"
        ? window.prompt("修正の要望があれば入力してください。空なら自動で修正します。", "") ?? ""
        : "";

    setToolBusy(true);
    setFixPreview("");

    const titleMap = {
      fix: "Fix Preview",
      advice: "Feedback",
      explain: "Explanation",
    };

    setToolModal({
      open: true,
      mode: action,
      title: titleMap[action],
      content: "",
    });

    try {
      const response = await fetch(`${API_BASE}/api/code/${action}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: selectedFile.content,
          instruction,
          language: selectedFile.language,
          filename: selectedFile.path,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }

      await readNdjsonStream(response, (eventData) => {
        if (eventData.type === "status") {
          setStatus(eventData.value);
          return;
        }

        if (eventData.type === "token" || eventData.type === "done") {
          setToolModal((current) => ({ ...current, content: eventData.value }));
          if (action === "fix") {
            setFixPreview(eventData.value);
          }
          return;
        }

        if (eventData.type === "error") {
          throw new Error(eventData.value);
        }
      });

      setStatus(`${action} completed`);
    } catch (error) {
      setToolModal({
        open: true,
        mode: "error",
        title: "Action Error",
        content: error.message,
      });
      setStatus("エラー");
    } finally {
      setToolBusy(false);
    }
  }

  function openProjectFixComposer() {
    if (!selectedProject || selectedProject.files.length === 0 || toolBusy) {
      return;
    }
    setProjectFixComposer({ open: true, instruction: "" });
  }

  async function runProjectAction(action, instructionOverride = "") {
    if (!selectedProject || selectedProject.files.length === 0 || toolBusy) {
      return;
    }

    const instruction = action === "fix" ? instructionOverride : "";
    setToolBusy(true);
    setProjectFixPreview([]);
    setProjectFixDiffs([]);

    const titleMap = {
      fix: "Project Fix Preview",
      advice: "Project Feedback",
      explain: "Project Explanation",
    };

    setToolModal({
      open: true,
      mode: `project-${action}`,
      title: titleMap[action],
      content: "",
    });

    try {
      const response = await fetch(`${API_BASE}/api/project/${action}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: selectedProject.files.map((file) => ({
            filename: file.path,
            content: file.content,
            language: file.language,
            kind: file.kind,
          })),
          instruction,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }

      await readNdjsonStream(response, (eventData) => {
        if (eventData.type === "status") {
          setStatus(eventData.value);
          return;
        }

        if (eventData.type === "token" || eventData.type === "done") {
          setToolModal((current) => ({ ...current, content: eventData.value }));
          if (action === "fix") {
            const parsed = parseProjectFixResult(eventData.value);
            if (parsed) {
              setProjectFixPreview(parsed);
              setProjectFixDiffs(buildProjectFixDiffs(selectedProject.files, parsed));
            }
          }
          return;
        }

        if (eventData.type === "error") {
          throw new Error(eventData.value);
        }
      });

      setStatus(`project ${action} completed`);
    } catch (error) {
      setToolModal({
        open: true,
        mode: "error",
        title: "Project Action Error",
        content: error.message,
      });
      setStatus("エラー");
    } finally {
      setToolBusy(false);
    }
  }

  async function submitProjectFixComposer() {
    const instruction = projectFixComposer.instruction.trim();
    setProjectFixComposer({ open: false, instruction: "" });
    await runProjectAction("fix", instruction);
  }

  function applyFix() {
    if (!selectedFile || selectedFile.kind !== "text" || !fixPreview) {
      return;
    }

    updateSelectedFileContent(fixPreview);
    closeToolModal();
    setStatus(`Applied fix to ${selectedFile.path}`);
  }

  function applyProjectFix() {
    if (!selectedProject || projectFixPreview.length === 0) {
      return;
    }

    patchSelectedProject((project) => ({
      ...project,
      files: project.files.map((file) => {
        const updated = projectFixPreview.find((candidate) => candidate.filename === file.path);
        return updated ? { ...file, content: updated.content } : file;
      }),
    }));
    closeToolModal();
    setStatus(`Applied project fix to ${selectedProject.name}`);
  }

  function clearChat() {
    setChatMessages([INITIAL_CHAT_MESSAGE]);
  }

  return (
    <div
      className={`app-shell ${dragActive ? "drag-active" : ""}`}
      onClick={() => setAppMenuOpen(false)}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget === event.target) {
          setDragActive(false);
        }
      }}
      onDrop={handleDrop}
    >
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />

      <AppHeader
        status={status}
        toolBusy={toolBusy}
        appMenuOpen={appMenuOpen}
        onToggleAppMenu={() => setAppMenuOpen((current) => !current)}
        onSaveApp={saveProjectsToApp}
        onCreateProject={createNewProject}
        onOpenChat={(event) => {
          event?.stopPropagation?.();
          setChatOpen(true);
        }}
        onOpenFilePicker={() => inputRef.current?.click()}
        onOpenFolderPicker={() => document.getElementById("folder-input")?.click()}
        inputRef={inputRef}
        onFileUpload={handleFileUpload}
      />

      <ProjectTabs
        projects={projects}
        selectedProjectId={selectedProjectId}
        editingProjectId={editingProjectId}
        editingProjectName={editingProjectName}
        onSelectProject={setSelectedProjectId}
        onStartRenameProject={startProjectRename}
        onChangeEditingProjectName={setEditingProjectName}
        onCommitProjectRename={commitProjectRename}
        onCancelProjectRename={cancelProjectRename}
        onRemoveProject={removeProject}
      />

      <main className="workspace-grid code-layout">
        <ProjectSidebar
          selectedProject={selectedProject}
          files={files}
          fileTree={fileTree}
          toolBusy={toolBusy}
          collapsedFolders={collapsedFolders}
          editingNode={editingNode}
          onStartRenameProject={startProjectRename}
          onCreateEmptyFile={createEmptyFile}
          onCreateFolder={createFolder}
          onRenameSelectedNode={renameSelectedNode}
          onDownloadProjectArchive={downloadProjectArchive}
          onOpenProjectFixComposer={openProjectFixComposer}
          onRunProjectAdvice={() => runProjectAction("advice")}
          onRunProjectExplain={() => runProjectAction("explain")}
          onSelectFolder={selectFolder}
          onToggleFolder={toggleFolder}
          onSelectFile={selectFile}
          onRemoveFile={removeFile}
          onUpdateEditingNodeDraft={updateEditingNodeDraft}
          onCommitEditingNode={commitEditingNode}
          onCancelEditingNode={cancelEditingNode}
        />

        <EditorPanel
          selectedFile={selectedFile}
          toolBusy={toolBusy}
          onLoadCurrentCodeIntoChat={loadCurrentCodeIntoChat}
          onRunFix={() => runCodeAction("fix")}
          onRunAdvice={() => runCodeAction("advice")}
          onRunExplain={() => runCodeAction("explain")}
          onDownloadSelectedFile={() => selectedFile && downloadTextFile(selectedFile.name, selectedFile.content)}
          onUpdateSelectedFileContent={updateSelectedFileContent}
        />
      </main>

      {dragActive ? (
        <div className="drop-overlay">
          <div className="drop-card">
            <p className="panel-kicker">Drop Files</p>
            <h2>ここにコードファイルをドロップ</h2>
            <p>複数ファイルをまとめて追加できます。</p>
          </div>
        </div>
      ) : null}

      <AssistantModal
        toolModal={toolModal}
        onClose={closeToolModal}
        fixPreview={fixPreview}
        selectedFile={selectedFile}
        onApplyFix={applyFix}
        onDownloadFixed={downloadTextFile}
        projectFixPreview={projectFixPreview}
        projectFixDiffs={projectFixDiffs}
        onApplyProjectFix={applyProjectFix}
      />

      <ProjectFixComposerModal
        open={projectFixComposer.open}
        instruction={projectFixComposer.instruction}
        onClose={() => setProjectFixComposer({ open: false, instruction: "" })}
        onChangeInstruction={(value) => setProjectFixComposer((current) => ({ ...current, instruction: value }))}
        onSubmit={submitProjectFixComposer}
      />

      <ChatModal
        open={chatOpen}
        chatContext={chatContext}
        chatMessages={chatMessages}
        chatInput={chatInput}
        chatBusy={chatBusy}
        chatBodyRef={chatBodyRef}
        selectedFile={selectedFile}
        onClose={() => setChatOpen(false)}
        onLoadCurrentCodeIntoChat={loadCurrentCodeIntoChat}
        onChangeChatInput={setChatInput}
        onClearChat={clearChat}
        onSendChatMessage={sendChatMessage}
      />
    </div>
  );
}
