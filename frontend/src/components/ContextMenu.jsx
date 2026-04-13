export default function ContextMenu({ menu, onClose }) {
  if (!menu?.open) {
    return null;
  }

  return (
    <div className="context-menu-layer" onClick={onClose}>
      <section
        className="context-menu panel"
        style={{ left: menu.x, top: menu.y }}
        onClick={(event) => event.stopPropagation()}
      >
        {menu.title ? <p className="panel-kicker">{menu.title}</p> : null}
        <div className="context-menu-items">
          {menu.items.map((item) => (
            <button
              key={item.label}
              className={`context-menu-item ${item.danger ? "danger" : ""}`}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
              disabled={item.disabled}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
