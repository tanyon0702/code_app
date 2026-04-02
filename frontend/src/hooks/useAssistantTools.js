import { useState } from "react";
import { buildProjectFixDiffs } from "../utils/diffUtils";
import { parseProjectFixResult } from "../utils/fileUtils";
import { downloadProjectStateFromPayload } from "../utils/projectStorage";
import { readNdjsonStream } from "../utils/streamUtils";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8001";

export function useAssistantTools({
  selectedProject,
  selectedFile,
  patchSelectedProject,
  savedSnapshots,
  setStatus,
}) {
  const [toolBusy, setToolBusy] = useState(false);
  const [toolModal, setToolModal] = useState({ open: false, mode: "", title: "", content: "" });
  const [fixPreview, setFixPreview] = useState("");
  const [projectFixPreview, setProjectFixPreview] = useState([]);
  const [projectFixDiffs, setProjectFixDiffs] = useState([]);
  const [projectFixComposer, setProjectFixComposer] = useState({ open: false, instruction: "" });

  function closeToolModal() {
    setToolModal({ open: false, mode: "", title: "", content: "" });
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

  function exportSnapshot(snapshotId) {
    const snapshot = savedSnapshots.find((item) => item.id === snapshotId);
    if (!snapshot) {
      return;
    }

    downloadProjectStateFromPayload(
      {
        app: "code-app",
        version: 2,
        exportedAt: snapshot.createdAt,
        selectedProjectId: snapshot.selectedProjectId,
        projects: snapshot.projects,
      },
      `${snapshot.name.replace(/[\\/:*?"<>|]/g, "_") || "code-app-projects"}.json`,
    );
    setStatus(`書き出しました: ${snapshot.name}`);
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

  function applyFix(updateSelectedFileContent) {
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

  return {
    toolBusy,
    toolModal,
    fixPreview,
    projectFixPreview,
    projectFixDiffs,
    projectFixComposer,
    setProjectFixComposer,
    closeToolModal,
    downloadProjectArchive,
    exportSnapshot,
    runCodeAction,
    openProjectFixComposer,
    runProjectAction,
    submitProjectFixComposer,
    applyFix,
    applyProjectFix,
  };
}
