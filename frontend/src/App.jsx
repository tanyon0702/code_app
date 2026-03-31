import { useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8001";

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

function getBaseName(path) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}

function buildFileTree(files) {
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
    selectedFileId: null,
  };
}

const INITIAL_PROJECT = createProject("Project 1");

export default function App() {
  const [projects, setProjects] = useState([INITIAL_PROJECT]);
  const [selectedProjectId, setSelectedProjectId] = useState(INITIAL_PROJECT.id);
  const [status, setStatus] = useState("ファイルを追加してください");
  const [toolBusy, setToolBusy] = useState(false);
  const [toolModal, setToolModal] = useState({ open: false, mode: "", title: "", content: "" });
  const [fixPreview, setFixPreview] = useState("");
  const [projectFixPreview, setProjectFixPreview] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState({});
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
  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedProject?.selectedFileId) ?? null,
    [files, selectedProject],
  );
  const fileTree = useMemo(() => buildFileTree(files), [files]);

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
      };
    });
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

  async function runProjectAction(action) {
    if (!selectedProject || selectedProject.files.length === 0 || toolBusy) {
      return;
    }

    const instruction =
      action === "fix"
        ? window.prompt("プロジェクト全体に対する修正要望があれば入力してください。", "") ?? ""
        : "";

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
    return nodes.map((node) => {
      if (node.type === "folder") {
        const collapsed = Boolean(collapsedFolders[node.path]);
        return (
          <div key={node.id} className="tree-node">
            <button
              className="tree-row folder-row"
              style={{ paddingLeft: `${12 + depth * 16}px` }}
              onClick={() => toggleFolder(node.path)}
            >
              <span className="tree-caret">{collapsed ? "▸" : "▾"}</span>
              <span className="tree-label">{node.name}</span>
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
            onClick={() => patchSelectedProject((project) => ({ ...project, selectedFileId: file.id }))}
          >
            <span className="tree-caret tree-caret-placeholder">•</span>
            <span className="tree-label">{file.name}</span>
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
  }

  return (
    <div
      className={`app-shell ${dragActive ? "drag-active" : ""}`}
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
        <div>
          <p className="eyebrow">Local LLM Code Assistant</p>
          <h1>Fix, Review, Explain</h1>
        </div>
        <div className="status-cluster">
          <span className={`status-pill ${toolBusy ? "live" : ""}`}>{status}</span>
          <button className="ghost-button" onClick={() => setChatOpen(true)}>
            Open Chat
          </button>
          <button className="ghost-button" onClick={createNewProject}>
            New Project
          </button>
          <button className="ghost-button" onClick={() => inputRef.current?.click()}>
            Upload Files
          </button>
          <button className="ghost-button" onClick={() => document.getElementById("folder-input")?.click()}>
            Upload Folder
          </button>
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
        </div>
      </header>

      <section className="project-strip">
        {projects.map((project) => (
          <button
            key={project.id}
            className={`project-tab ${project.id === selectedProjectId ? "selected" : ""}`}
            onClick={() => setSelectedProjectId(project.id)}
          >
            <span>{project.name}</span>
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
            <button
              className="ghost-button compact accent"
              onClick={() => runProjectAction("fix")}
              disabled={files.length === 0 || toolBusy}
            >
              Project Fix
            </button>
            <button
              className="ghost-button compact"
              onClick={() => runProjectAction("advice")}
              disabled={files.length === 0 || toolBusy}
            >
              Project Feedback
            </button>
            <button
              className="ghost-button compact"
              onClick={() => runProjectAction("explain")}
              disabled={files.length === 0 || toolBusy}
            >
              Project Explain
            </button>
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
              <button
                className="ghost-button compact"
                onClick={loadCurrentCodeIntoChat}
                disabled={!selectedFile || selectedFile.kind !== "text"}
              >
                Read In Chat
              </button>
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
              <button
                className="ghost-button compact"
                onClick={() => selectedFile && downloadTextFile(selectedFile.name, selectedFile.content)}
                disabled={!selectedFile}
              >
                Download
              </button>
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
    </div>
  );
}
