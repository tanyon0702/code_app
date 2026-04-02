export const STORAGE_KEY = "code-assistant-projects-v2";
export const LEGACY_STORAGE_KEY = "code-assistant-projects-v1";
export const SAVED_SNAPSHOTS_KEY = "code-app-saved-snapshots-v1";
const STORAGE_VERSION = 2;

export function createProject(name = "New Project") {
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

export function createInitialProjects() {
  return [createProject("Project 1")];
}

function sanitizeFile(file, index) {
  return {
    id: file?.id ?? globalThis.crypto?.randomUUID?.() ?? `file-${Date.now()}-${index}`,
    name: file?.name ?? `file-${index + 1}.txt`,
    path: file?.path ?? file?.name ?? `file-${index + 1}.txt`,
    kind: file?.kind === "image" ? "image" : "text",
    content: typeof file?.content === "string" ? file.content : "",
    language: typeof file?.language === "string" ? file.language : "plaintext",
  };
}

export function sanitizeProject(project, index) {
  return {
    id: project?.id ?? globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${index}`,
    name: project?.name ?? `Project ${index + 1}`,
    files: Array.isArray(project?.files) ? project.files.map(sanitizeFile) : [],
    folders: Array.isArray(project?.folders)
      ? project.folders.filter((folder) => typeof folder === "string")
      : [],
    selectedFileId: project?.selectedFileId ?? null,
    selectedNodePath: typeof project?.selectedNodePath === "string" ? project.selectedNodePath : "",
    selectedNodeType:
      project?.selectedNodeType === "file" || project?.selectedNodeType === "folder"
        ? project.selectedNodeType
        : "root",
  };
}

export function loadStoredState() {
  const fallbackProjects = createInitialProjects();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const projects = Array.isArray(parsed?.projects)
        ? parsed.projects.map(sanitizeProject)
        : fallbackProjects;
      const selectedProjectId =
        typeof parsed?.selectedProjectId === "string" ? parsed.selectedProjectId : projects[0]?.id ?? "";

      return {
        version: parsed?.version ?? STORAGE_VERSION,
        projects: projects.length > 0 ? projects : fallbackProjects,
        selectedProjectId,
      };
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      const legacyProjects = Array.isArray(parsed) ? parsed.map(sanitizeProject) : fallbackProjects;
      return {
        version: 1,
        projects: legacyProjects.length > 0 ? legacyProjects : fallbackProjects,
        selectedProjectId: legacyProjects[0]?.id ?? "",
      };
    }
  } catch {
    return {
      version: STORAGE_VERSION,
      projects: fallbackProjects,
      selectedProjectId: fallbackProjects[0].id,
    };
  }

  return {
    version: STORAGE_VERSION,
    projects: fallbackProjects,
    selectedProjectId: fallbackProjects[0].id,
  };
}

export function saveStoredState(projects, selectedProjectId) {
  const payload = {
    version: STORAGE_VERSION,
    selectedProjectId,
    projects,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function buildExportPayload(projects, selectedProjectId) {
  return {
    app: "code-app",
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    selectedProjectId,
    projects,
  };
}

export function downloadProjectStateFromPayload(payload, filename = "code-app-projects.json") {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadProjectState(projects, selectedProjectId) {
  const payload = buildExportPayload(projects, selectedProjectId);
  downloadProjectStateFromPayload(payload);
}

export async function readImportedState(file) {
  const raw = await file.text();
  const parsed = JSON.parse(raw);

  if (parsed?.app !== "code-app" || !Array.isArray(parsed?.projects)) {
    throw new Error("Invalid project export file.");
  }

  const projects = parsed.projects.map(sanitizeProject);
  if (projects.length === 0) {
    throw new Error("Imported project list is empty.");
  }

  const selectedProjectId =
    typeof parsed.selectedProjectId === "string" ? parsed.selectedProjectId : projects[0].id;

  return {
    version: parsed.version ?? STORAGE_VERSION,
    projects,
    selectedProjectId,
  };
}

function sanitizeSnapshot(snapshot, index) {
  const projects = Array.isArray(snapshot?.projects) ? snapshot.projects.map(sanitizeProject) : [];
  return {
    id: snapshot?.id ?? globalThis.crypto?.randomUUID?.() ?? `snapshot-${Date.now()}-${index}`,
    name: snapshot?.name ?? `Save ${index + 1}`,
    createdAt: typeof snapshot?.createdAt === "string" ? snapshot.createdAt : new Date().toISOString(),
    selectedProjectId:
      typeof snapshot?.selectedProjectId === "string" ? snapshot.selectedProjectId : projects[0]?.id ?? "",
    projects,
  };
}

export function loadSavedSnapshots() {
  try {
    const raw = window.localStorage.getItem(SAVED_SNAPSHOTS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(sanitizeSnapshot).filter((snapshot) => snapshot.projects.length > 0);
  } catch {
    return [];
  }
}

export function saveSavedSnapshots(snapshots) {
  window.localStorage.setItem(SAVED_SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

export function createSnapshot(projects, selectedProjectId, name = "") {
  const resolvedName =
    name.trim() ||
    `${projects.find((project) => project.id === selectedProjectId)?.name ?? "Project"} ${new Date().toLocaleString()}`;

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `snapshot-${Date.now()}`,
    name: resolvedName,
    createdAt: new Date().toISOString(),
    selectedProjectId,
    projects,
  };
}
