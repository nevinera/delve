// Auto Barriers, for a map drawn in cells: walls along the trees' and
// water's edges, fill points, and a line connection for each of the
// cells' exits (see cells/autoBarriers.js). It makes more than barriers,
// so it has its own section in the Map tab.
import {useState} from "react";

export default function AutoBarriersPanel({barriers, busy, onAutoBarriers}) {
  // What it last did: {added, openEdge, error}.
  const [result, setResult] = useState(null);
  const hasBarriers = barriers.length > 0;
  return (
    <>
      <div className="map-sidebar-section-heading">
        <h3>Auto Barriers</h3>
      </div>
      <div className="add-buttons-row">
        <button
          type="button" className="add-entry" disabled={hasBarriers || busy}
          title={hasBarriers ? "Only for a map with no barriers yet" : "Walls along the trees' and water's edges, and a connection at each exit"}
          onClick={() => setResult(onAutoBarriers())}
        >
          Auto Barriers
        </button>
      </div>
      {result?.error && <p className="map-sidebar-hint">{result.error}</p>}
      {result && !result.error && (
        <p className="map-sidebar-hint">
          Added {result.added.walls} walls, {result.added.circles} circles ({result.added.segments} segments), {result.added.fillPoints} fill points and {result.added.connections} connections.
          {result.openEdge && " Open ground reaches the map's edge, so it will be filled - ring the map with trees."}
        </p>
      )}
    </>
  );
}
