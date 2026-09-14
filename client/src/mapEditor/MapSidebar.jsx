import {useState} from "react";

// Reserves the right-hand column for the entry-list panels later slices add
// (barriers/connections/units - see the map editor plan) - empty for now,
// just collapsible so a wide map image isn't permanently squeezed by an
// as-yet-unused column.
export default function MapSidebar({children}) {
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
