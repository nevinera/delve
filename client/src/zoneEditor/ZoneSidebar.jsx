import {useState} from "react";

// Reserves the right-hand column for the entry-list panels (name field,
// maps list) - collapsible so the graph (the big left-hand pane, per every
// other editor's layout convention) isn't permanently squeezed by it. Same
// shape and CSS classes as the map editor's own MapSidebar.jsx - reused by
// name, not import, since editors here are otherwise self-contained.
export default function ZoneSidebar({children}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`map-editor-sidebar${collapsed ? " collapsed" : ""}`}>
      <button
        type="button"
        className="map-editor-sidebar-toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand panel" : "Collapse panel"}
      >
        {collapsed ? "«" : "»"}
      </button>
      {!collapsed && <div className="map-editor-sidebar-content">{children}</div>}
    </div>
  );
}
