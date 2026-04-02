import { useEffect, useMemo, useState } from "react";
import {
  buildFileTree,
  getBaseName,
  getParentPath,
  inferFileKind,
  inferLanguage,
  joinPath,
  readFileAsDataUrl,
  readFileAsText,
} from "../utils/fileUtils";
import {
  createProject,
  createSnapshot,
  loadSavedSnapshots,
  loadStoredState,
  saveSavedSnapshots,
  saveStoredState,
} from "../utils/projectStorage";

export function useWorkspaceState(setStatus) {
  const storedState = useMemo(() => loadStoredState(), []);

  const [projects, setProjects] = useState(storedState.projects);
  const [selectedProjectId, setSelectedProjectId] = useState(storedState.selectedProjectId);
  const [dragActive, setDragActive] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState({});
  const [editingNode, setEditingNode] = useState(null);
  const [savedProjectsOpen, setSavedProjectsOpen] = useState(false);
  const [savedSnapshots, setSavedSnapshots] = useState(() => loadSavedSnapshots());

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
    saveSavedSnapshots(savedSnapshots);
  }, [savedSnapshots]);

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

  function resetWorkspaceTransientState() {
    setEditingNode(null);
    setEditingProjectId(null);
    setEditingProjectName("");
  }

  function saveCurrentSnapshot() {
    const snapshot = createSnapshot(projects, selectedProjectId);
    setSavedSnapshots((current) => [snapshot, ...current]);
    setStatus(`保存しました: ${snapshot.name}`);
  }

  function loadSnapshot(snapshotId) {
    const snapshot = savedSnapshots.find((item) => item.id === snapshotId);
    if (!snapshot) {
      return;
    }

    setProjects(snapshot.projects);
    setSelectedProjectId(snapshot.selectedProjectId);
    resetWorkspaceTransientState();
    setSavedProjectsOpen(false);
    setStatus(`読み込みました: ${snapshot.name}`);
  }

  function deleteSnapshot(snapshotId) {
    const snapshot = savedSnapshots.find((item) => item.id === snapshotId);
    setSavedSnapshots((current) => current.filter((item) => item.id !== snapshotId));
    if (snapshot) {
      setStatus(`削除しました: ${snapshot.name}`);
    }
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
        selectedFileId:
          project.selectedFileId === fileId ? (remaining[0]?.id ?? null) : project.selectedFileId,
        selectedNodePath:
          project.selectedFileId === fileId
            ? (remaining[0]?.path ?? project.selectedNodePath)
            : project.selectedNodePath,
        selectedNodeType:
          project.selectedFileId === fileId
            ? (remaining[0] ? "file" : project.selectedNodeType)
            : project.selectedNodeType,
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

  return {
    projects,
    selectedProjectId,
    selectedProject,
    files,
    folders,
    selectedFile,
    fileTree,
    dragActive,
    setDragActive,
    editingProjectId,
    editingProjectName,
    setEditingProjectName,
    appMenuOpen,
    setAppMenuOpen,
    collapsedFolders,
    editingNode,
    savedProjectsOpen,
    setSavedProjectsOpen,
    savedSnapshots,
    patchSelectedProject,
    createNewProject,
    startProjectRename,
    commitProjectRename,
    cancelProjectRename,
    saveCurrentSnapshot,
    loadSnapshot,
    deleteSnapshot,
    removeProject,
    handleFileUpload,
    handleDrop,
    updateSelectedFileContent,
    removeFile,
    selectFolder,
    toggleFolder,
    selectFile,
    createEmptyFile,
    createFolder,
    renameSelectedNode,
    updateEditingNodeDraft,
    commitEditingNode,
    cancelEditingNode,
  };
}
