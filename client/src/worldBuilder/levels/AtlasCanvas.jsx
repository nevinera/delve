import {useEffect, useRef, useState} from "react";
import usePinchZoom from "../../usePinchZoom";
import {bendLink, insertVertex, moveCorner, moveMap, moveZone, removeVertex} from "../../worldEditor/atlasEdit";

const MIN_ZOOM = 0.005;
const MAX_ZOOM = 4;
const CLICK_SLOP = 4; // pixels a press can move and still count as a click
const FIT_MARGIN = 0.9;
const CORNER_RADIUS = 7; // pixels
const EDGE_HANDLE = 8; // pixels across
const BEND_RADIUS = 5; // pixels
const MASK_EXTENT = 1e7; // feet: a link mask's reach, past anything drawn
const ZONE_COLORS = ["#e76f51", "#2a9d8f", "#e9c46a", "#8ab17d", "#9b5de5", "#f4a261", "#4cc9f0", "#f15bb5"];

export const zoneColor = (index) => ZONE_COLORS[index % ZONE_COLORS.length];

const midpoint = (a, b) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});

// A link's line: straight, or a curve through `through` (its control point
// set so the curve's middle lands there).
function linkPath({from, to, through}) {
  if (!through) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const mid = midpoint(from, to);
  return `M ${from.x} ${from.y} Q ${2 * through.x - mid.x} ${2 * through.y - mid.y} ${to.x} ${to.y}`;
}

function fitView(atlas, width, height) {
  const points = Object.values(atlas?.zones ?? {}).flatMap((z) => z.outline ?? []);
  if (!points.length || width <= 0 || height <= 0) return {panX: width / 2, panY: height / 2, zoom: 0.2};
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, FIT_MARGIN * Math.min(width / Math.max(maxX - minX, 1), height / Math.max(maxY - minY, 1))));
  // y is north: screen y = panY - zoom * y.
  return {panX: width / 2 - zoom * (minX + maxX) / 2, panY: height / 2 + zoom * (minY + maxY) / 2, zoom};
}

// The world's atlas (docs/schema/world.md#atlas), north up and to scale:
// each zone's outline, its maps as their thumbnails, and lines for the
// links between maps (over the two maps each joins, behind any other) (zoneLinks solid, worldLinks dashed),
// as linksFor(atlas) gives them (see atlasLinks). Drag a map to move it in
// its zone, a zone (between its maps) to move it whole, an outline's
// vertex to reshape it, or the handle in the middle of an outline's edge to
// split it there; double-click a vertex to remove it. Drag a link's handle
// to bend it, double-click it to straighten it. Every move stops where it
// would break the atlas's rules (see atlasEdit.js), and is reported
// (onChange, with the new atlas) when the drag ends. Drag outside the
// zones to pan, wheel or pinch to zoom. Hovering (or tapping) a map shows
// its name. With editable false, there are no handles and nothing moves:
// the atlas as the in-game map will show it, everything explored.
export default function AtlasCanvas({atlas, sizes, zoneNames, mapNames, thumbnails, linksFor, onChange, onOpenMap, editable = true}) {
  const wrapper = useRef(null);
  const [view, setView] = useState(null);
  const [dragged, setDragged] = useState(null); // the atlas mid-drag
  const [label, setLabel] = useState(null); // {text, x, y} in wrapper pixels
  const press = useRef(null);
  const shown = dragged ?? atlas;
  // The latest mid-drag atlas, for reporting when the drag ends.
  const latest = useRef(null);
  latest.current = dragged;

  useEffect(() => {
    const rect = wrapper.current?.getBoundingClientRect();
    setView(fitView(atlas, rect?.width ?? 800, rect?.height ?? 600));
    // Fit once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pinchHandlers = usePinchZoom(wrapper, view && {zoom: view.zoom, offset: {x: view.panX, y: view.panY}}, {
    clampZoom: (zoom) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)),
    onPinch: ({zoom, offset}) => setView({zoom, panX: offset.x, panY: offset.y}),
    onPinchStart: () => {
      press.current = null;
      setDragged(null);
    },
  });

  const local = (e) => {
    const rect = wrapper.current.getBoundingClientRect();
    return {x: e.clientX - rect.left, y: e.clientY - rect.top};
  };
  const toWorld = (p) => ({x: (p.x - view.panX) / view.zoom, y: (view.panY - p.y) / view.zoom});
  const toScreen = (p) => ({x: view.panX + p.x * view.zoom, y: view.panY - p.y * view.zoom});

  // target: null (background), {zone}, {zone, map}, {zone, corner},
  // {zone, edge} or {link} (a line from linksFor).
  function onPointerDown(e, target = null) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // Read-only, a press anywhere pans (a map can still be tapped for its
    // name).
    if (!editable && !target?.map) target = null;
    press.current = {target, base: atlas, start: local(e), grab: toWorld(local(e)), view, moved: false};
  }

  function onPointerMove(e) {
    const p = press.current;
    const at = local(e);
    if (!p) return;
    if (Math.hypot(at.x - p.start.x, at.y - p.start.y) > CLICK_SLOP) p.moved = true;
    if (!p.moved) return;
    const {target} = p;
    if (!target || !editable) {
      setView({...p.view, panX: p.view.panX + at.x - p.start.x, panY: p.view.panY + at.y - p.start.y});
      return;
    }
    const world = toWorld(at);
    const by = {x: world.x - p.grab.x, y: world.y - p.grab.y};
    setLabel(null);
    if (target.edge != null) {
      // Splitting an edge: from here on, it's dragging the new vertex.
      p.base = insertVertex(atlas, target.zone, target.edge);
      p.target = {zone: target.zone, corner: target.edge + 1};
    }
    const {base, target: moving} = p;
    if (moving.map) {
      const from = base.zones[moving.zone].maps[moving.map];
      setDragged(moveMap(base, sizes, moving.zone, moving.map, {x: from.x + by.x, y: from.y + by.y}));
    } else if (moving.corner != null) {
      const from = base.zones[moving.zone].outline[moving.corner];
      setDragged(moveCorner(base, sizes, moving.zone, moving.corner, {x: from.x + by.x, y: from.y + by.y}));
    } else if (moving.link) {
      const from = base.bends?.[moving.link.key] ?? {x: 0, y: 0};
      setDragged(bendLink(base, moving.link.key, {x: from.x + by.x, y: from.y + by.y}));
    } else {
      setDragged(moveZone(base, moving.zone, by));
    }
  }

  function onPointerUp(e) {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.moved && latest.current) onChange(latest.current);
    else if (!p.moved && p.target?.map) setLabel({text: mapNames[p.target.zone]?.[p.target.map] ?? p.target.map, ...local(e)});
    else if (!p.moved) setLabel(null);
    setDragged(null);
  }

  function onWheel(e) {
    if (!view) return;
    const {x, y} = local(e);
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    setView({zoom, panX: x - (x - view.panX) * (zoom / view.zoom), panY: y - (y - view.panY) * (zoom / view.zoom)});
  }

  const hover = (zone, map) => (e) => {
    if (!press.current) setLabel({text: mapNames[zone]?.[map] ?? map, ...local(e)});
  };

  const zones = Object.entries(shown?.zones ?? {});
  const links = shown ? linksFor(shown) : [];
  const mapRects = zones.flatMap(([zone, entry]) => Object.entries(entry.maps).flatMap(([map, at]) => (sizes[zone]?.[map] ? [{zone, map, ...at, ...sizes[zone][map]}] : [])));
  const commit = (next) => next !== atlas && onChange(next);
  return (
    <div className={`atlas-canvas${editable ? "" : " atlas-canvas-locked"}`} ref={wrapper} {...pinchHandlers} onPointerDown={(e) => onPointerDown(e)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}>
      {!zones.length && <p className="atlas-canvas-empty">Nothing laid out yet.</p>}
      {view && (
        <svg width="100%" height="100%" role="img" aria-label="Atlas">
          <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom} ${-view.zoom})`}>
            {zones.map(([zone, entry], i) => (
              <polygon key={zone} className="atlas-zone" points={entry.outline.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={`${zoneColor(i)}22`} stroke={zoneColor(i)} vectorEffect="non-scaling-stroke"
                onPointerDown={(e) => onPointerDown(e, {zone})} aria-label={`Zone ${zone}`} />
            ))}
            {zones.flatMap(([zone, entry], i) => Object.entries(entry.maps).map(([map, at]) => {
              const size = sizes[zone]?.[map];
              if (!size) return null;
              const href = thumbnails[zone]?.[map];
              return (
                <g key={`${zone}/${map}`} className="atlas-map" transform={`translate(${at.x} ${at.y + size.height}) scale(1 -1)`}
                  onPointerDown={(e) => onPointerDown(e, {zone, map})} onPointerMove={hover(zone, map)} onPointerLeave={() => !press.current && setLabel(null)}
                  onDoubleClick={() => onOpenMap?.(zone, map)} aria-label={`Map ${map}`}>
                  {href
                    ? <image href={href} width={size.width} height={size.height} preserveAspectRatio="none" />
                    : <rect width={size.width} height={size.height} fill={`${zoneColor(i)}66`} />}
                  <rect className="atlas-map-frame" width={size.width} height={size.height} vectorEffect="non-scaling-stroke" />
                </g>
              );
            }))}
            {/* Links over the maps, each masked out where it crosses a map
                other than the two it joins: on top of its own, behind the rest. */}
            <defs>
              {links.map((link, i) => (
                <mask key={link.key} id={`atlas-link-mask-${i}`} maskUnits="userSpaceOnUse" x={-MASK_EXTENT} y={-MASK_EXTENT} width={2 * MASK_EXTENT} height={2 * MASK_EXTENT}>
                  <rect x={-MASK_EXTENT} y={-MASK_EXTENT} width={2 * MASK_EXTENT} height={2 * MASK_EXTENT} fill="white" />
                  {mapRects.filter((r) => !link.ends.some((end) => end.zone === r.zone && end.map === r.map)).map((r) => (
                    <rect key={`${r.zone}/${r.map}`} x={r.x} y={r.y} width={r.width} height={r.height} fill="black" />
                  ))}
                </mask>
              ))}
            </defs>
            {links.map((link, i) => (
              <path key={link.key} className={`atlas-link atlas-link-${link.kind}`} d={linkPath(link)} mask={`url(#atlas-link-mask-${i})`} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          {zones.map(([zone, entry], i) => {
            const corner = toScreen(entry.outline.reduce((best, p) => (p.y - p.x > best.y - best.x ? p : best)));
            return <text key={zone} className="atlas-zone-name" x={corner.x + 6} y={corner.y + 16} fill={zoneColor(i)}>{zoneNames[zone] ?? zone}</text>;
          })}
          {editable && links.map((link) => {
            const at = toScreen(link.through ?? midpoint(link.from, link.to));
            return (
              <circle key={link.key} className={`atlas-bend${link.through ? " atlas-bend-bent" : ""}`} cx={at.x} cy={at.y} r={BEND_RADIUS}
                onPointerDown={(e) => onPointerDown(e, {link})} onDoubleClick={() => commit(bendLink(atlas, link.key, null))}
                aria-label={`Bend ${link.key}`} />
            );
          })}
          {editable && zones.flatMap(([zone, entry], i) => entry.outline.map((p, edge) => {
            const at = toScreen(midpoint(p, entry.outline[(edge + 1) % entry.outline.length]));
            return (
              <rect key={`${zone}/edge/${edge}`} className="atlas-edge" x={at.x - EDGE_HANDLE / 2} y={at.y - EDGE_HANDLE / 2} width={EDGE_HANDLE} height={EDGE_HANDLE}
                stroke={zoneColor(i)} onPointerDown={(e) => onPointerDown(e, {zone, edge})} aria-label={`Edge ${edge + 1} of ${zone}`} />
            );
          }))}
          {editable && zones.flatMap(([zone, entry], i) => entry.outline.map((p, corner) => {
            const at = toScreen(p);
            return (
              <circle key={`${zone}/${corner}`} className="atlas-corner" cx={at.x} cy={at.y} r={CORNER_RADIUS} stroke={zoneColor(i)}
                onPointerDown={(e) => onPointerDown(e, {zone, corner})} onDoubleClick={() => commit(removeVertex(atlas, sizes, zone, corner))}
                aria-label={`Corner ${corner + 1} of ${zone}`} />
            );
          }))}
        </svg>
      )}
      {label && <div className="atlas-label" style={{left: label.x + 12, top: label.y + 12}}>{label.text}</div>}
    </div>
  );
}
