import {feetToPixel} from "./mapCoords";

// Read-only rendering of committed connections plus their selection handles
// - a distinct color from barriers (see BarrierShapes.jsx), since a
// connection is a trigger/entry-point, not an obstacle. A point connection
// is a single draggable marker (position only - no separate handle); a
// line connection is a segment with a drag handle at each end (mirrors a
// wall's per-point handles, not a circle's move+resize pair, since both
// ends are independently meaningful).
const CONNECTION_COLOR = "#4ac0e0";
const SELECTED_COLOR = "#8fe3fa";
const HANDLE_RADIUS = 5;
const POINT_RADIUS = 5;
const STROKE_WIDTH = 3;
const HOVERED_STROKE_WIDTH = STROKE_WIDTH * 2;

export default function ConnectionShapes({connections, pixelDimensions, feetDimensions, tool, selectedIndex, hoveredIndex, onSelect, onStartDragPoint, onStartDragEndpoint}) {
  function toPixel(loc) {
    return feetToPixel(loc.x, loc.y, pixelDimensions, feetDimensions);
  }

  // Only "select" mode selects/drags an existing connection on click - in
  // an add-tool, a click landing on top of an existing connection should
  // fall through untouched to the canvas's own add handling.
  const selectable = tool === "select";

  return (
    <svg className="map-canvas-shapes" width={pixelDimensions.width} height={pixelDimensions.height}>
      {connections.map((conn, i) => {
        const selected = selectable && selectedIndex === i;
        const color = selected ? SELECTED_COLOR : CONNECTION_COLOR;

        if (conn.type === "point") {
          const p = toPixel(conn.position);
          return (
            <circle
              key={i} cx={p.x} cy={p.y} r={hoveredIndex === i ? POINT_RADIUS * 1.5 : POINT_RADIUS}
              fill={color} stroke="#000" strokeWidth={1}
              onPointerDown={selectable ? (e) => onStartDragPoint(i, e) : undefined}
            />
          );
        }

        const start = toPixel(conn.start);
        const end = toPixel(conn.end);
        const strokeWidth = hoveredIndex === i ? HOVERED_STROKE_WIDTH : STROKE_WIDTH;
        return (
          <g key={i}>
            <line
              x1={start.x} y1={start.y} x2={end.x} y2={end.y}
              stroke={color} strokeWidth={strokeWidth}
              onPointerDown={selectable ? (e) => { e.stopPropagation(); onSelect(i); } : undefined}
            />
            {selected && (
              <>
                <circle cx={start.x} cy={start.y} r={HANDLE_RADIUS} fill={SELECTED_COLOR} stroke="#000" strokeWidth={1} onPointerDown={(e) => onStartDragEndpoint(i, "start", e)} />
                <circle cx={end.x} cy={end.y} r={HANDLE_RADIUS} fill={SELECTED_COLOR} stroke="#000" strokeWidth={1} onPointerDown={(e) => onStartDragEndpoint(i, "end", e)} />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
