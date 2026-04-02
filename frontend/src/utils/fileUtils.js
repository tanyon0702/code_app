export function inferLanguage(filename) {
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

export function inferFileKind(filename) {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg"].includes(extension)) {
    return "image";
  }
  return "text";
}

export function getFileIcon(file) {
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

export function getBaseName(path) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}

export function getParentPath(path) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function joinPath(parentPath, name) {
  return parentPath ? `${parentPath}/${name}` : name;
}

export function buildFileTree(files, folders) {
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

export async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

export async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseProjectFixResult(rawText) {
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
