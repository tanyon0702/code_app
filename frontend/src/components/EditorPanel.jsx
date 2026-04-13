import { useRef, useState } from "react";
import Editor from "@monaco-editor/react";

const MONACO_LANGUAGE_MAP = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  rust: "rust",
  java: "java",
  csharp: "csharp",
  cpp: "cpp",
  c: "c",
  html: "html",
  css: "css",
  json: "json",
  markdown: "markdown",
  go: "go",
  php: "php",
  ruby: "ruby",
  swift: "swift",
  kotlin: "kotlin",
  sql: "sql",
  shell: "shell",
  yaml: "yaml",
  plaintext: "plaintext",
};

function resolveMonacoLanguage(language) {
  return MONACO_LANGUAGE_MAP[language] ?? "plaintext";
}

function configureMonacoTheme(monaco) {
  monaco.editor.defineTheme("code-app-night", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b7280" },
      { token: "keyword", foreground: "f59e0b" },
      { token: "string", foreground: "86efac" },
      { token: "number", foreground: "fda4af" },
      { token: "type.identifier", foreground: "7dd3fc" },
      { token: "delimiter", foreground: "cbd5e1" },
    ],
    colors: {
      "editor.background": "#0f1726",
      "editor.foreground": "#eef2ff",
      "editorLineNumber.foreground": "#5b6578",
      "editorLineNumber.activeForeground": "#cbd5e1",
      "editorCursor.foreground": "#fbbf24",
      "editor.selectionBackground": "#1d4ed833",
      "editor.inactiveSelectionBackground": "#1e293b99",
      "editor.lineHighlightBackground": "#172033",
      "editor.lineHighlightBorder": "#00000000",
      "editorIndentGuide.background1": "#1f2937",
      "editorIndentGuide.activeBackground1": "#334155",
      "editorWhitespace.foreground": "#334155",
      "editorWidget.background": "#111827",
      "editorWidget.border": "#334155",
      "editorSuggestWidget.background": "#111827",
      "editorSuggestWidget.border": "#334155",
      "editorSuggestWidget.selectedBackground": "#1d4ed844",
      "scrollbarSlider.background": "#33415566",
      "scrollbarSlider.hoverBackground": "#47556988",
      "scrollbarSlider.activeBackground": "#64748b99",
    },
  });
}

export default function EditorPanel({
  selectedFile,
  toolBusy,
  onLoadCurrentCodeIntoChat,
  onRunFix,
  onRunAdvice,
  onRunExplain,
  onRequestCompletion,
  onDownloadSelectedFile,
  onUpdateSelectedFileContent,
}) {
  const editorRef = useRef(null);
  const [completionBusy, setCompletionBusy] = useState(false);

  async function runCompletion() {
    if (!selectedFile || selectedFile.kind !== "text" || toolBusy || completionBusy || !editorRef.current) {
      return;
    }

    const editor = editorRef.current;
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection) {
      return;
    }

    const startOffset = model.getOffsetAt(selection.getStartPosition());
    const endOffset = model.getOffsetAt(selection.getEndPosition());
    const prefix = selectedFile.content.slice(0, startOffset);
    const suffix = selectedFile.content.slice(endOffset);

    setCompletionBusy(true);
    const completion = await onRequestCompletion({
      targetFile: selectedFile,
      prefix,
      suffix,
    });
    setCompletionBusy(false);

    if (!completion) {
      return;
    }

    const nextContent = `${prefix}${completion}${suffix}`;
    const nextOffset = startOffset + completion.length;
    onUpdateSelectedFileContent(nextContent);

    requestAnimationFrame(() => {
      const nextModel = editor.getModel();
      if (!nextModel) {
        return;
      }
      const nextPosition = nextModel.getPositionAt(nextOffset);
      editor.focus();
      editor.setPosition(nextPosition);
      editor.revealPositionInCenter(nextPosition);
    });
  }

  return (
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
                onClick={onDownloadSelectedFile}
                disabled={!selectedFile}
              >
                Download
              </button>
              <button
                className="ghost-button compact"
                onClick={onLoadCurrentCodeIntoChat}
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
                onClick={onRunFix}
                disabled={!selectedFile || selectedFile.kind !== "text" || toolBusy}
              >
                Fix
              </button>
              <button
                className="ghost-button compact accent"
                onClick={runCompletion}
                disabled={!selectedFile || selectedFile.kind !== "text" || toolBusy || completionBusy}
              >
                Complete
              </button>
              <button
                className="ghost-button compact"
                onClick={onRunAdvice}
                disabled={!selectedFile || selectedFile.kind !== "text" || toolBusy}
              >
                Feedback
              </button>
              <button
                className="ghost-button compact"
                onClick={onRunExplain}
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
                <span>Ctrl+Space で補完</span>
              </>
            ) : null}
          </div>

          {selectedFile.kind === "image" ? (
            <div className="image-viewer">
              <img className="image-preview" src={selectedFile.content} alt={selectedFile.name} />
            </div>
          ) : (
            <div className="code-editor monaco-host">
              <Editor
                key={selectedFile.id}
                path={selectedFile.path}
                language={resolveMonacoLanguage(selectedFile.language)}
                value={selectedFile.content}
                theme="code-app-night"
                beforeMount={(monaco) => {
                  configureMonacoTheme(monaco);
                }}
                onMount={(editor, monaco) => {
                  editorRef.current = editor;
                  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
                    runCompletion();
                  });
                }}
                onChange={(value) => onUpdateSelectedFileContent(value ?? "")}
                options={{
                  automaticLayout: true,
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineHeight: 22,
                  smoothScrolling: true,
                  scrollBeyondLastLine: false,
                  wordWrap: "off",
                  tabSize: 2,
                  insertSpaces: true,
                  formatOnPaste: true,
                  formatOnType: false,
                  renderWhitespace: "selection",
                  padding: { top: 14, bottom: 14 },
                  overviewRulerBorder: false,
                  foldingHighlight: false,
                  hideCursorInOverviewRuler: true,
                }}
              />
            </div>
          )}
        </>
      ) : (
        <div className="empty-editor">
          <p>まずコードファイルをアップロードしてください。</p>
        </div>
      )}
    </section>
  );
}
