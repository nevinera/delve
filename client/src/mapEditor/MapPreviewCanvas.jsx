import {useEffect, useRef} from "react";
import {MapPreviewScene} from "./MapPreviewScene";
import {reachableArea} from "./reachableArea";

const WALL_CLEARANCE_FEET = 2;

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// True when a walker can stand at `p`: on the map, not inside a circle
// barrier, and not right up against a wall.
function isOpenSpot(mapData, p) {
  const {width, height} = mapData.feetDimensions;
  if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) return false;
  for (const b of mapData.barriers ?? []) {
    if (b.type === "circle" && b.location && Math.hypot(p.x - b.location.x, p.y - b.location.y) <= b.radius) return false;
    if (b.type === "wall" && b.locations) {
      for (let i = 0; i + 1 < b.locations.length; i++) {
        if (distToSegment(p, b.locations[i], b.locations[i + 1]) < WALL_CLEARANCE_FEET) return false;
      }
    }
  }
  return true;
}

function connectionPoints(mapData) {
  const points = [];
  for (const c of mapData.connections ?? []) {
    if (c?.type === "point" && c.position) points.push({x: c.position.x, y: c.position.y});
    else if (c?.type === "line" && c.start && c.end) points.push({x: (c.start.x + c.end.x) / 2, y: (c.start.y + c.end.y) / 2});
  }
  return points;
}

// Where the walk preview starts: the center of the part of the map the editor
// was showing (`viewCenter`, in feet), if a walker can stand there. Otherwise
// (or with no view at all - it then defaults to the map's center), or it
// can't be reached from an entrance (walled off), the entrance
// nearest that point: a map has no spawn point of its own - real play starts
// at Zone.entryPoints (docs/schema/zone.md), which this editor can't resolve
// without zone context - so a connection (a point's position, or a line's
// midpoint) stands in. With no connections, the point itself, clamped to the map.
export function startPositionFor(mapData, viewCenter = null) {
  const {width, height} = mapData.feetDimensions;
  const from = viewCenter ?? {x: width / 2, y: height / 2};
  const entrances = connectionPoints(mapData);
  // With entrances, the spot must also be reachable from one (not walled off, e.g. outside the outer walls).
  const reachable = entrances.length ? reachableArea(mapData, entrances, WALL_CLEARANCE_FEET) : null;
  if (isOpenSpot(mapData, from) && (!reachable || reachable.contains(from))) return {x: from.x, y: from.y};
  const nearest = entrances.sort(
    (a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y)
  )[0];
  return nearest ?? {x: Math.min(width, Math.max(0, from.x)), y: Math.min(height, Math.max(0, from.y))};
}

// Mounts MapPreviewScene onto a canvas - the React side of the "walk it" 3D
// preview (Phase 2 of the map editor plan). Rendered by MapCanvas in place
// of the normal top-down SVG view while `previewing` is active (see
// MapEditor's togglePreview) - a controllable token plus every unit on the
// map, each following its own configured movement, walking around the
// current draft's barriers.
// groundImage (a bitmap or canvas) is the ground instead of imageUrl, for a
// map drawn in cells.
// stampLayer ({sets, sheets}) bakes the map's decoration stamps into the
// ground, under groundCanopy (a cell map's tree crowns) when there is one.
export default function MapPreviewCanvas({mapData, availableUnitTypes, imageUrl, groundImage = null, groundCanopy = null, stampLayer = null, viewCenter = null, onExit}) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const scene = new MapPreviewScene(canvasRef.current);
    // "daylight" | "torchlight" - see MapPreviewScene's setLightingMode.
    // The map's own authored `lighting` field (MapFieldsPanel.jsx,
    // docs/schema/map.md) - defaults to daylight when unset, same as
    // everywhere else that field is read. No in-preview toggle any more -
    // it's an authored map setting now, not a session-only choice.
    scene.setLightingMode(mapData.lighting === "torchlight" ? "torchlight" : "daylight");
    const {x, y} = startPositionFor(mapData, viewCenter);
    // isSvg comes from mapData.imageUrl - the repo-relative filename - not
    // the imageUrl prop above (an opaque blob:/data: URL used to actually
    // load the bytes), since that carries no file extension to sniff.
    const isSvg = Boolean(mapData.imageUrl?.toLowerCase().endsWith(".svg"));
    scene.loadMap(
      {feetDimensions: mapData.feetDimensions, barriers: mapData.barriers, connections: mapData.connections, fillPoints: mapData.fillPoints, units: mapData.units, imageUrl, isSvg, groundImage, groundCanopy, pixelDimensions: mapData.pixelDimensions,
        stamps: stampLayer && mapData.stamps?.length ? {placed: mapData.stamps, sets: stampLayer.sets, sheets: stampLayer.sheets} : null},
      availableUnitTypes, x, y
    );
    scene.handleResize();
    scene.startLoop();

    const resizeObserver = new ResizeObserver(() => scene.handleResize());
    resizeObserver.observe(wrapperRef.current);

    return () => {
      resizeObserver.disconnect();
      scene.dispose();
    };
    // Mounts once per preview session - mapData/availableUnitTypes/imageUrl
    // are read only at mount (editing is locked while previewing, so they
    // can't change underneath it; see MapEditor's togglePreview).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapperRef} className="map-preview-wrapper">
      <canvas ref={canvasRef} className="map-preview-canvas" />
      <p className="map-preview-hint">Drag to look around, scroll to zoom, W/S walk, Q/E strafe, A/D turn, Shift to sprint.</p>
      <button type="button" className="map-preview-exit" onClick={onExit}>Exit Preview</button>
    </div>
  );
}
