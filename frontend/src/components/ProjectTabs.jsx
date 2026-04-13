export default function ProjectTabs({
  projects,
  selectedProjectId,
  editingProjectId,
  editingProjectName,
  onCreateProject,
  onSelectProject,
  onStartRenameProject,
  onChangeEditingProjectName,
  onCommitProjectRename,
  onCancelProjectRename,
  onRemoveProject,
  onOpenProjectContextMenu,
}) {
  function handleProjectContextMenu(event, project) {
    event.preventDefault();
    event.stopPropagation();
    onSelectProject(project.id);
    onOpenProjectContextMenu(event, project);
  }

  return (
    <section className="project-strip">
      <button
        type="button"
        className="project-tab project-tab-add"
        onClick={(event) => {
          event.stopPropagation();
          onCreateProject();
        }}
        aria-label="Create project"
      >
        <span className="project-tab-plus">+</span>
      </button>

      {projects.map((project) => (
        <div
          key={project.id}
          className={`project-tab ${project.id === selectedProjectId ? "selected" : ""}`}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onSelectProject(project.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectProject(project.id);
            }
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onStartRenameProject(project);
          }}
          onContextMenu={(event) => handleProjectContextMenu(event, project)}
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
            <button
              type="button"
              className="project-remove"
              onClick={(event) => {
                event.stopPropagation();
                onRemoveProject(project.id);
              }}
              onContextMenu={(event) => event.stopPropagation()}
              aria-label={`Delete ${project.name}`}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </section>
  );
}
