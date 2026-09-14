import {feetToPixel, feetSpacingToPixelsX} from "./mapCoords";

// Read-only rendering of committed barriers plus their selection handles -
// MapCanvas owns all the interaction state (tool mode, drag gestures,
// in-progress draft shapes); this just turns feet-space barrier data into
// pixel-space SVG, and reports pointerdowns back up.
const BARRIER_COLOR = "#e0b64a";
const SELECTED_COLOR = "#ffde7a";
const HANDLE_RADIUS = 5;
const STROKE_WIDTH = 3;
const HOVERED_STROKE_WIDTH = STROKE_WIDTH * 2;
const POINT_HOVER_RADIUS_FEET = 3;

export default function BarrierShapes({barriers, pixelDimensions, feetDimensions, tool, selectedIndex, hoveredIndex, hoveredPoint, onSelect, onStartDragPoint, onStartDragCircleMove, onStartDragCircleResize}) {
  function toPixel(loc) {
    return feetToPixel(loc.x, loc.y, pixelDimensions, feetDimensions);
  }

  // Only "select" mode selects/drags an existing shape on click - in an
  // add-tool, a click landing on top of an existing barrier should fall
  // through untouched to the canvas's own add-wall/add-circle handling
  // (no stopPropagation, no selection change).
  const selectable = tool === "select";

  return (
    <svg className="map-canvas-shapes" width={pixelDimensions.width} height={pixelDimensions.height}>
      {barriers.map((barrier, i) => {
        const selected = selectable && selectedIndex === i;
        const color = selected ? SELECTED_COLOR : BARRIER_COLOR;
        const strokeWidth = hoveredIndex === i ? HOVERED_STROKE_WIDTH : STROKE_WIDTH;

        if (barrier.type === "wall") {
          const points = barrier.locations.map(toPixel);
          return (
            <g key={i}>
              <polyline
                points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke={color} strokeWidth={strokeWidth}
                onPointerDown={selectable ? (e) => { e.stopPropagation(); onSelect(i); } : undefined}
              />
              {selected && points.map((p, pi) => (
                <circle
                  key={pi} cx={p.x} cy={p.y} r={HANDLE_RADIUS}
                  fill={SELECTED_COLOR} stroke="#000" strokeWidth={1}
                  onPointerDown={(e) => onStartDragPoint(i, pi, e)}
                />
              ))}
              {/* points[hoveredPoint.pointIndex] can briefly be missing -
                  removing a point via its pill's × button doesn't fire a
                  mouseleave (the pill unmounts instead), so a stale
                  pointIndex can still be hovered for one render after the
                  removal shrinks this barrier's locations. */}
              {hoveredPoint?.barrierIndex === i && points[hoveredPoint.pointIndex] && (
                <circle
                  className="map-canvas-point-hover-ring"
                  cx={points[hoveredPoint.pointIndex].x} cy={points[hoveredPoint.pointIndex].y}
                  r={feetSpacingToPixelsX(POINT_HOVER_RADIUS_FEET, pixelDimensions, feetDimensions)}
                  fill="rgba(255,255,255,0.25)" stroke="none"
                />
              )}
            </g>
          );
        }

        const center = toPixel(barrier.location);
        // Approximates a uniform px/ft scale (the x-axis one) - a real
        // circle in feet-space only renders as a true circle in pixel-space
        // when the image's aspect ratio matches feetDimensions', which is
        // the normal case for real content.
        const radiusPx = feetSpacingToPixelsX(barrier.radius, pixelDimensions, feetDimensions);
        return (
          <g key={i}>
            <circle
              cx={center.x} cy={center.y} r={radiusPx}
              fill="rgba(224,182,74,0.15)" stroke={color} strokeWidth={strokeWidth}
              onPointerDown={selectable ? (e) => onStartDragCircleMove(i, e) : undefined}
            />
            {selected && (
              <circle
                cx={center.x + radiusPx} cy={center.y} r={HANDLE_RADIUS}
                fill={SELECTED_COLOR} stroke="#000" strokeWidth={1}
                onPointerDown={(e) => onStartDragCircleResize(i, e)}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
