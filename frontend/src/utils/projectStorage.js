export const STORAGE_KEY = "code-assistant-projects-v2";
export const LEGACY_STORAGE_KEY = "code-assistant-projects-v1";
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
