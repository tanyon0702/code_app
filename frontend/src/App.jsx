import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8001";
const STORAGE_KEY = "code-assistant-projects-v1";

function inferLanguage(filename) {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const map = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rs: "rust",
    java: "java",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    h: "c",
    html: "html",
    css: "css",
    json: "json",
    md: "markdown",
    go: "go",
    php: "php",
    rb: "ruby",
    swift: "swift",
    kt: "kotlin",
    sql: "sql",
    sh: "shell",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[extension] ?? "plaintext";
}

function inferFileKind(filename) {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg"].includes(extension)) {
    return "image";
  }
  return "text";
}

function getFileIcon(file) {
  if (file.kind === "image") {
    return "🖼";
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const iconMap = {
    js: "🟨",
    jsx: "⚛",
    ts: "🔷",
    tsx: "⚛",
    py: "🐍",
    rs: "🦀",
    html: "🌐",
    css: "🎨",
    json: "🧩",
    md: "📝",
    yml: "⚙",
    yaml: "⚙",
    sh: "⌘",
    bat: "⌘",
    ps1: "⌘",
  };

  return iconMap[extension] ?? "📄";
}

function getBaseName(path) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}

function getParentPath(path) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function joinPath(parentPath, name) {
  return parentPath ? `${parentPath}/${name}` : name;
}

function buildFileTree(files, folders) {
  const root = [];
  const folderMap = new Map();

  function ensureFolder(pathParts) {
    let currentNodes = root;
    let currentPath = "";

    for (const part of pathParts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let folder = folderMap.get(currentPath);
      if (!folder) {
        folder = {
          id: `folder:${currentPath}`,
          name: part,
          type: "folder",
          path: currentPath,
          children: [],
        };
        folderMap.set(currentPath, folder);
        currentNodes.push(folder);
      }
      currentNodes = folder.children;
    }

    return currentNodes;
  }

  for (const file of files) {
    const pathParts = file.path.split("/").filter(Boolean);
    const fileName = pathParts.pop() ?? file.name;
    const target = ensureFolder(pathParts);
    target.push({
      id: file.id,
      name: fileName,
      type: "file",
      file,
    });
  }

  for (const folderPath of folders) {
    const pathParts = folderPath.split("/").filter(Boolean);
    ensureFolder(pathParts);
  }

  const sortNodes = (nodes) => {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
    for (const node of nodes) {
      if (node.type === "folder") {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(root);
  return root;
}

async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function readNdjsonStream(response, handlers) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const eventData = JSON.parse(line);
      handlers?.(eventData);
    }
  }
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function parseProjectFixResult(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || !Array.isArray(parsed.files)) {
      return null;
    }
    return parsed.files;
  } catch {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    try {
      const parsed = JSON.parse(rawText.slice(start, end + 1));
      return Array.isArray(parsed.files) ? parsed.files : null;
    } catch {
      return null;
    }
  }
}

function createProject(name = "New Project") {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
    name,
    files: [],
    folders: [],
    selectedFileId: null,
    selectedNodePath: "",
    selectedNodeType: "root",
  };
}

function createInitialProjects() {
  return [createProject("Project 1")];
}

function loadStoredProjects() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialProjects();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return createInitialProjects();
    }

    return parsed.map((project, index) => ({
      id: project.id ?? globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${index}`,
      name: project.name ?? `Project ${index + 1}`,
      files: Array.isArray(project.files) ? project.files : [],
      folders: Array.isArray(project.folders) ? project.folders : [],
      selectedFileId: project.selectedFileId ?? null,
      selectedNodePath: project.selectedNodePath ?? "",
      selectedNodeType: project.selectedNodeType ?? "root",
    }));
  } catch {
    return createInitialProjects();
  }
}

export default function App() {
  const [projects, setProjects] = useState(loadStoredProjects);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [status, setStatus] = useState("ファイルを追加してください");
  const [toolBusy, setToolBusy] = useState(false);
  const [toolModal, setToolModal] = useState({ open: false, mode: "", title: "", content: "" });
  const [fixPreview, setFixPreview] = useState("");
  const [projectFixPreview, setProjectFixPreview] = useState([]);
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
  const [chatMessages, setChatMessages] = useState([
    {
      id: globalThis.crypto?.randomUUID?.() ?? "chat-welcome",
      role: "assistant",
      content: "質問を入力してください。必要なら先に現在のコードを読み込ませられます。",
    },
  ]);
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    if (!selectedProjectId && projects[0]?.id) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  function patchSelectedProject(updater) {
    setProjects((current) =>
      current.map((project) => (project.id === selectedProjectId ? updater(project) : project)),
    );
  }

  function createNewProject() {
    const name = window.prompt("プロジェクト名を入力してください。", `Project ${projects.length + 1}`)?.trim();
    if (!name) {
      return;
    }
    const project = createProject(name);
    setProjects((current) => [...current, project]);
    setSelectedProjectId(project.id);
    setStatus(`Created ${name}`);
  }

  function startProjectRename(project) {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
  }

  function commitProjectRename() {
    const nextName = editingProjectName.trim();
    if (!editingProjectId) {
      return;
    }
    if (!nextName) {
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    setStatus("アプリ内に保存しました");
  }

  function removeProject(projectId) {
    setProjects((current) => {
      if (current.length === 1) {
        return current;
      }
      const remaining = current.filter((project) => project.id !== projectId);
      if (selectedProjectId === projectId) {
        setSelectedProjectId(remaining[0].id);
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
          ...loadedFiles
            .map((file) => getParentPath(file.path))
            .filter(Boolean),
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
      files: project.files.map((file) => (file.id === selectedFile.id ? { ...file, content: nextContent } : file)),
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
    const parentPath = getTargetFolderPath();
    setEditingNode({
      mode: "create-file",
      type: "file",
      path: "__new_file__",
      parentPath,
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
      if (nextName === selectedFile.name) {
        setEditingNode(null);
        return;
      }
      const nextPath = joinPath(editingNode.parentPath, nextName);
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

    const nextUserMessage = {
      id: globalThis.crypto?.randomUUID?.() ?? `chat-user-${Date.now()}`,
      role: "user",
      content: prompt,
    };
    const assistantId = globalThis.crypto?.randomUUID?.() ?? `chat-assistant-${Date.now()}`;
    const nextMessages = [...chatMessages, nextUserMessage];

    setChatMessages([...nextMessages, { id: assistantId, role: "assistant", content: "" }]);
    setChatInput("");
    setChatBusy(true);
    setStatus("チャット送信中...");

    const contextText = chatContext
      ? `ファイル名: ${chatContext.path ?? chatContext.filename}\n言語: ${chatContext.language}\nコード:\n${chatContext.content}`
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
          message.id === assistantId
            ? { ...message, content: `エラー: ${error.message}` }
            : message,
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
    setToolModal({ open: false, mode: "", title: "", content: "" });
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
    setToolModal({ open: false, mode: "", title: "", content: "" });
    setStatus(`Applied project fix to ${selectedProject.name}`);
  }

  function toggleFolder(path) {
    setCollapsedFolders((current) => ({
      ...current,
      [path]: !current[path],
    }));
  }

  function renderTreeNodes(nodes, depth = 0) {
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
                patchSelectedProject((project) => ({
                  ...project,
                  selectedNodePath: node.path,
                  selectedNodeType: "folder",
                  selectedFileId:
                    project.selectedNodeType === "file" && project.selectedNodePath === node.path
                      ? null
                      : project.selectedFileId,
                }));
                toggleFolder(node.path);
              }}
            >
              <span className="tree-caret">{collapsed ? "▸" : "▾"}</span>
              <span className="tree-icon">📁</span>
              {editingNode?.type === "folder" && editingNode.path === node.path ? (
                <input
                  className="tree-inline-input"
                  value={editingNode.draft}
                  autoFocus
                  onChange={(event) => setEditingNode((current) => (current ? { ...current, draft: event.target.value } : current))}
                  onBlur={commitEditingNode}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitEditingNode();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelEditingNode();
                    }
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                <span className="tree-label">{node.name}</span>
              )}
            </button>
            {!collapsed ? renderTreeNodes(node.children, depth + 1) : null}
          </div>
        );
      }

      const file = node.file;
      return (
        <div key={node.id} className="tree-node">
          <button
            className={`tree-row file-row ${selectedProject?.selectedFileId === file.id ? "selected" : ""}`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() =>
              patchSelectedProject((project) => ({
                ...project,
                selectedFileId: file.id,
                selectedNodePath: file.path,
                selectedNodeType: "file",
              }))
            }
          >
            <span className="tree-caret tree-caret-placeholder">•</span>
            <span className="tree-icon">{getFileIcon(file)}</span>
            {editingNode?.type === "file" && editingNode.path === file.path ? (
              <input
                className="tree-inline-input"
                value={editingNode.draft}
                autoFocus
                onChange={(event) => setEditingNode((current) => (current ? { ...current, draft: event.target.value } : current))}
                onBlur={commitEditingNode}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitEditingNode();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEditingNode();
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
                removeFile(file.id);
              }}
            >
              Remove
            </span>
          </button>
        </div>
      );
    });

    if (editingNode && depth === (editingNode.parentPath ? editingNode.parentPath.split("/").length : 0) && editingNode.mode.startsWith("create-")) {
      rendered.push(
        <div key={editingNode.path} className="tree-node">
          <div className="tree-row file-row creating-row" style={{ paddingLeft: `${12 + depth * 16}px` }}>
            <span className="tree-caret tree-caret-placeholder">•</span>
            <span className="tree-icon">{editingNode.type === "folder" ? "📁" : "📄"}</span>
            <input
              className="tree-inline-input"
              value={editingNode.draft}
              autoFocus
              onChange={(event) => setEditingNode((current) => (current ? { ...current, draft: event.target.value } : current))}
              onBlur={commitEditingNode}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitEditingNode();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEditingNode();
                }
              }}
            />
          </div>
        </div>,
      );
    }

    return rendered;
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

      <header className="topbar">
        <div className="topbar-leading">
          <div className="menu-anchor">
            <button
              className={`menu-button ${appMenuOpen ? "open" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                setAppMenuOpen((current) => !current);
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
                    <button className="ghost-button compact" onClick={saveProjectsToApp}>
                      Save App
                    </button>
                    <button className="ghost-button compact" onClick={createNewProject}>
                      New Project
                    </button>
                  </div>
                </div>
                <div className="control-section inline menu-section">
                  <span className="control-label">Import</span>
                  <div className="control-buttons">
                    <button className="ghost-button compact" onClick={() => inputRef.current?.click()}>
                      Upload Files
                    </button>
                    <button className="ghost-button compact" onClick={() => document.getElementById("folder-input")?.click()}>
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
          onChange={handleFileUpload}
        />
        <input
          id="folder-input"
          className="hidden-input"
          type="file"
          multiple
          webkitdirectory="true"
          directory="true"
          onChange={handleFileUpload}
        />
      </header>

      <section className="project-strip">
        {projects.map((project) => (
          <button
            key={project.id}
            className={`project-tab ${project.id === selectedProjectId ? "selected" : ""}`}
            onClick={() => setSelectedProjectId(project.id)}
            onDoubleClick={() => startProjectRename(project)}
          >
            {editingProjectId === project.id ? (
              <input
                className="project-tab-input"
                value={editingProjectName}
                autoFocus
                onChange={(event) => setEditingProjectName(event.target.value)}
                onBlur={commitProjectRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitProjectRename();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelProjectRename();
                  }
                }}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <span>{project.name}</span>
            )}
            {projects.length > 1 ? (
              <span
                className="project-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  removeProject(project.id);
                }}
              >
                ×
              </span>
            ) : null}
          </button>
        ))}
      </section>

      <main className="workspace-grid code-layout">
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
                  onClick={() => selectedProject && startProjectRename(selectedProject)}
                  disabled={!selectedProject}
                >
                  Rename Project
                </button>
                <button className="ghost-button compact" onClick={createEmptyFile}>
                  New File
                </button>
                <button className="ghost-button compact" onClick={createFolder}>
                  New Folder
                </button>
                <button
                  className="ghost-button compact"
                  onClick={renameSelectedNode}
                  disabled={!selectedProject || selectedProject.selectedNodeType === "root"}
                >
                  Rename Node
                </button>
                <button
                  className="ghost-button compact"
                  onClick={downloadProjectArchive}
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
                  onClick={openProjectFixComposer}
                  disabled={files.length === 0 || toolBusy}
                >
                  Project Fix
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => runProjectAction("advice")}
                  disabled={files.length === 0 || toolBusy}
                >
                  Feedback
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => runProjectAction("explain")}
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
            {renderTreeNodes(fileTree)}
          </div>
        </aside>

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
                    onClick={() => selectedFile && downloadTextFile(selectedFile.name, selectedFile.content)}
                    disabled={!selectedFile}
                  >
                    Download
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={loadCurrentCodeIntoChat}
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
                    onClick={() => runCodeAction("fix")}
                    disabled={!selectedFile || selectedFile.kind !== "text" || toolBusy}
                  >
                    Fix
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={() => runCodeAction("advice")}
                    disabled={!selectedFile || selectedFile.kind !== "text" || toolBusy}
                  >
                    Feedback
                  </button>
                  <button
                    className="ghost-button compact"
                    onClick={() => runCodeAction("explain")}
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
                  onChange={(event) => updateSelectedFileContent(event.target.value)}
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

      {toolModal.open ? (
        <div className="chat-modal-backdrop" onClick={() => setToolModal({ open: false, mode: "", title: "", content: "" })}>
          <section className="tool-modal panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Assistant Result</p>
                <h2>{toolModal.title}</h2>
              </div>
              <button className="ghost-button" onClick={() => setToolModal({ open: false, mode: "", title: "", content: "" })}>
                Close
              </button>
            </div>

            <pre className="tool-output">{toolModal.content || "..."}</pre>

            {toolModal.mode === "fix" ? (
              <div className="tool-actions">
                <button className="ghost-button" onClick={() => setToolModal({ open: false, mode: "", title: "", content: "" })}>
                  Cancel
                </button>
                <button className="primary-button" onClick={applyFix} disabled={!fixPreview}>
                  Apply Fix
                </button>
                <button
                  className="ghost-button"
                  onClick={() => selectedFile && fixPreview && downloadTextFile(`fixed-${selectedFile.name}`, fixPreview)}
                  disabled={!selectedFile || !fixPreview}
                >
                  Download Fixed
                </button>
              </div>
            ) : null}

            {toolModal.mode === "project-fix" ? (
              <div className="tool-actions">
                <span className="tool-hint">
                  {projectFixPreview.length > 0
                    ? `${projectFixPreview.length} files will be updated`
                    : "JSONを解析できた場合のみ適用できます"}
                </span>
                <button className="ghost-button" onClick={() => setToolModal({ open: false, mode: "", title: "", content: "" })}>
                  Cancel
                </button>
                <button className="primary-button" onClick={applyProjectFix} disabled={projectFixPreview.length === 0}>
                  Apply Project Fix
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {projectFixComposer.open ? (
        <div className="chat-modal-backdrop" onClick={() => setProjectFixComposer({ open: false, instruction: "" })}>
          <section className="prompt-modal panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Project Fix</p>
                <h2>修正要望を入力</h2>
              </div>
              <button className="ghost-button" onClick={() => setProjectFixComposer({ open: false, instruction: "" })}>
                Close
              </button>
            </div>

            <p className="prompt-copy">
              追加の修正要望があれば入力してください。空のまま送ると、自動で全体整合性ベースの修正を行います。
            </p>

            <textarea
              className="chat-input"
              value={projectFixComposer.instruction}
              onChange={(event) =>
                setProjectFixComposer((current) => ({ ...current, instruction: event.target.value }))
              }
              placeholder="例: API のエラーハンドリングを統一して、型のズレを直して"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  submitProjectFixComposer();
                }
              }}
            />

            <div className="tool-actions">
              <span className="tool-hint">`Ctrl+Enter` で実行</span>
              <button className="ghost-button" onClick={() => setProjectFixComposer({ open: false, instruction: "" })}>
                Cancel
              </button>
              <button className="primary-button" onClick={submitProjectFixComposer}>
                Start Project Fix
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {chatOpen ? (
        <div className="chat-modal-backdrop" onClick={() => setChatOpen(false)}>
          <section className="tool-modal panel chat-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Code Chat</p>
                <h2>Ask About Current Code</h2>
              </div>
              <div className="action-cluster">
                <button
                  className="ghost-button compact"
                  onClick={loadCurrentCodeIntoChat}
                  disabled={!selectedFile || selectedFile.kind !== "text"}
                >
                  Read Current File
                </button>
                <button className="ghost-button" onClick={() => setChatOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="chat-context-pill">
              {chatContext ? `Context: ${chatContext.filename}` : "Context: none"}
            </div>

            <div className="chat-thread" ref={chatBodyRef}>
              {chatMessages.map((message) => (
                <article key={message.id} className={`chat-bubble ${message.role}`}>
                  <span className="chat-role">{message.role === "user" ? "You" : "AI"}</span>
                  <p>{message.content || "..."}</p>
                </article>
              ))}
            </div>

            <div className="chat-composer">
              <textarea
                className="chat-input"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="コードについて質問してください"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendChatMessage();
                  }
                }}
              />
              <div className="tool-actions">
                <button className="ghost-button" onClick={() => setChatMessages(chatMessages.slice(0, 1))}>
                  Clear Chat
                </button>
                <button className="primary-button" onClick={sendChatMessage} disabled={chatBusy || !chatInput.trim()}>
                  Send
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <button
        className="chat-fab"
        onClick={(event) => {
          event.stopPropagation();
          setChatOpen(true);
        }}
        aria-label="Open chat"
      >
        <span className="chat-fab-icon">💬</span>
      </button>
    </div>
  );
}
