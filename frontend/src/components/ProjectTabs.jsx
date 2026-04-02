export default function ProjectTabs({
  projects,
  selectedProjectId,
  editingProjectId,
  editingProjectName,
  onSelectProject,
  onStartRenameProject,
  onChangeEditingProjectName,
  onCommitProjectRename,
  onCancelProjectRename,
  onRemoveProject,
}) {
  return (
    <section className="project-strip">
      {projects.map((project) => (
        <button
          key={project.id}
          className={`project-tab ${project.id === selectedProjectId ? "selected" : ""}`}
          onClick={() => onSelectProject(project.id)}
          onDoubleClick={() => onStartRenameProject(project)}
        >
          {editingProjectId === project.id ? (
            <input
              className="project-tab-input"
              value={editingProjectName}
              autoFocus
              onChange={(event) => onChangeEditingProjectName(event.target.value)}
              onBlur={onCommitProjectRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitProjectRename();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelProjectRename();
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
                onRemoveProject(project.id);
              }}
            >
              ×
            </span>
          ) : null}
        </button>
      ))}
    </section>
  );
}
