import {useMemo} from "react";
import {feetToPixel, feetSpacingToPixelsX} from "./mapCoords";
import {computeMapFill} from "../game/mapFill";

// Read-only shading of the map's fill (see game/mapFill.js) - everything
// the game draws raised and nobody can stand in - plus a marker on each of
// the map's fillPoints. Recomputed as the draft changes, so a leak in the
// walls shows up as soon as it's drawn.
const FILL_COLOR = "rgba(20, 20, 30, 0.45)";
const MARKER_COLOR = "#7fc8ff";
const MARKER_RADIUS_FEET = 1.5;

export default function FillShapes({mapData, pixelDimensions, feetDimensions, hoveredFillPoint}) {
  const fill = useMemo(
    () => computeMapFill({...mapData, feetDimensions}),
    [mapData, feetDimensions],
  );
  const toPixel = ([x, y]) => feetToPixel(x, y, pixelDimensions, feetDimensions);
  const ring = (points) => "M" + points.map((p) => { const {x, y} = toPixel(p); return `${x},${y}`; }).join("L") + "Z";
  const markerRadius = Math.max(4, feetSpacingToPixelsX(MARKER_RADIUS_FEET, pixelDimensions, feetDimensions));

  return (
    <svg className="map-canvas-shapes map-canvas-fill" width={pixelDimensions.width} height={pixelDimensions.height} pointerEvents="none">
      {fill.filled.map(({outer, holes}, i) => (
        <path key={i} data-testid="map-fill-region" d={[outer, ...holes].map(ring).join(" ")} fill={FILL_COLOR} fillRule="evenodd" />
      ))}
      {(mapData.fillPoints ?? []).map((p, i) => {
        const {x, y} = toPixel([p.x, p.y]);
        const r = hoveredFillPoint === i ? markerRadius * 1.6 : markerRadius;
        return (
          <g key={`point-${i}`} data-testid="map-fill-point">
            <circle cx={x} cy={y} r={r} fill="rgba(0,0,0,0.6)" stroke={MARKER_COLOR} strokeWidth={2} />
            <path d={`M${x - r * 0.5},${y}L${x + r * 0.5},${y}M${x},${y - r * 0.5}L${x},${y + r * 0.5}`} stroke={MARKER_COLOR} strokeWidth={2} />
          </g>
        );
      })}
    </svg>
  );
}
