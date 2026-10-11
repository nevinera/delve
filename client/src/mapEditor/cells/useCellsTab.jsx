// The map editor's Cells tab: drawing a map's cellMap (see
// docs/schema/map.md#cellmap) with a live render. MapWorkbench gets two
// halves from this - canvas props for MapCanvas (the render as its
// background, an overlay, and pointer handling) and the sidebar's panel.
//
// The canvas works in the render's pixels; dividing by the render scale
// gives cellMap feet, which are y-down like the render (map feet are y-up,
// but the Cells tab never deals in them).
//
// Every edit goes straight into the map (onCellMapChange). With no image
// the cells are the map's ground on every tab, so this also renders for
// them (rendering), and makes the map's thumbnail after an edit
// (onThumbnail(blob)).
import {useEffect, useRef, useState} from "react";
import {cellAt, cellPoint, hexDistance, mapSize, pointAt} from "../../cellMap/hexGrid";
import {renderScale} from "../../cellMap/render";
import {drawCells, drawTrails, hexPath, SELECTED_COLOR} from "../../cellMap/overlay";
import {useCellHistory} from "./useCellHistory";
import {useCellMapRender} from "./useCellMapRender";

export const EDITOR_PIXELS_PER_FOOT = 8;

// Overlay canvases are drawn at most this many pixels per foot; the CSS
// size matches the render, so they're just softer when zoomed right in.
const OVERLAY_PIXELS_PER_FOOT = 4;

// How close, in cells, a click must be to a trail point to grab it.
const GRAB_CELLS = 0.45;

export const TOOLS = {pan: "Pan", paint: "Paint", fill: "Fill", trail: "Trails"};
export const OVERLAYS = {none: "None", grid: "Grid", cells: "Cells"};
export const BRUSHES = [1, 2, 3];

const INITIAL_UI = {tool: "paint", terrain: "T", brush: 1, overlay: "grid", hover: null, selected: null, pendingPoint: null};

export function useCellsTab({mapKey, cellMap, onCellMapChange, editing, rendering = editing, onThumbnail = null}) {
  const history = useCellHistory(cellMap ?? null, onCellMapChange, mapKey);
  const {draft, change} = history;
  const [ui, setUi] = useState(INITIAL_UI);
  const {render, errors, pending} = useCellMapRender(rendering ? draft?.data : null, EDITOR_PIXELS_PER_FOOT);
  useThumbnail(onThumbnail && history.edits > 0 && !pending ? render : null, onThumbnail);
  const dragRef = useRef(null);
  // Each drag is its own undo step (see useCellHistory's groups).
  const nextDrag = useRef(0);

  const size = draft ? mapSize(draft.grid) : null;
  const scale = size ? renderScale(size, EDITOR_PIXELS_PER_FOOT) : 1;
  const pixelDimensions = size ? {width: Math.round(size.width * scale), height: Math.round(size.height * scale)} : null;

  const update = (fields) => setUi((current) => ({...current, ...fields}));

  useEffect(() => {
    if (!editing) return undefined;
    function onKeyDown(e) {
      if (e.target.closest?.("input, select, textarea")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && ui.selected?.point != null) {
        e.preventDefault();
        const {trail, point} = ui.selected;
        change((d) => d.removeTrailPoint(trail, point));
        update({selected: null});
      } else if (e.key === "Escape") {
        update({selected: null, pendingPoint: null});
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editing, ui.selected, history, change]);

  // Cell coordinates (fractional, for trails) and the cell under a canvas
  // pixel.
  function locate(px) {
    const x = px.x / scale;
    const y = px.y / scale;
    return {point: pointAt(x, y, draft.grid.cellSize), cell: cellAt(x, y, draft.grid.cellSize), x, y};
  }

  function nearestTrailPoint({x, y}) {
    let best = null;
    draft.trails.forEach((trail, t) => trail.points.forEach(([col, row], i) => {
      const p = cellPoint(col, row, draft.grid.cellSize);
      const d = Math.hypot(p.x - x, p.y - y) / draft.grid.cellSize;
      if (d <= GRAB_CELLS && (!best || d < best.d)) best = {trail: t, point: i, d};
    }));
    return best && {trail: best.trail, point: best.point};
  }

  // Paints every cell along the line from the last cell to this one, so a
  // fast drag doesn't skip any.
  function paintAlong(from, to, group) {
    const steps = Math.max(1, hexDistance(from, to));
    change((d) => {
      let next = d;
      for (let i = 0; i <= steps; i++) {
        const a = cellPoint(from[0], from[1], d.grid.cellSize);
        const b = cellPoint(to[0], to[1], d.grid.cellSize);
        const [c, r] = cellAt(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps, d.grid.cellSize);
        next = next.paint(c, r, ui.terrain, ui.brush);
      }
      return next;
    }, {group});
  }

  function trailDown(at) {
    const grabbed = nearestTrailPoint(at);
    if (grabbed) {
      update({selected: grabbed, pendingPoint: null});
      dragRef.current = {kind: "trail-point", ...grabbed, group: `drag:${nextDrag.current++}`};
      return;
    }
    if (ui.pendingPoint) {
      const trail = draft.trails.length;
      change((d) => d.addTrail([ui.pendingPoint, at.point]));
      update({pendingPoint: null, selected: {trail, point: 1}});
      return;
    }
    const {selected} = ui;
    if (selected) {
      // Extends the trail after the selected point, or before it when it's
      // the first point - so either end can grow.
      const points = draft.trails[selected.trail].points;
      const point = selected.point ?? points.length - 1;
      const index = point === 0 && points.length > 1 ? 0 : point + 1;
      change((d) => d.insertTrailPoint(selected.trail, index, at.point));
      update({selected: {trail: selected.trail, point: index}});
      return;
    }
    update({pendingPoint: at.point});
  }

  // phase is "down", "drag", "up", "hover" or "cancel"; returns true when
  // a "down" starts an edit (so MapCanvas doesn't pan).
  function onPointer(phase, px) {
    if (!draft) return false;
    if (phase === "up" || phase === "cancel") {
      dragRef.current = null;
      return true;
    }
    const at = locate(px);
    const inside = draft.inside(...at.cell);
    if (phase === "hover") {
      const hover = inside ? at.cell : null;
      if (hover?.[0] !== ui.hover?.[0] || hover?.[1] !== ui.hover?.[1]) update({hover});
      return true;
    }
    if (phase === "down") {
      if (ui.tool === "pan") return false;
      if (ui.tool === "paint" && inside) {
        const group = `drag:${nextDrag.current++}`;
        paintAlong(at.cell, at.cell, group);
        dragRef.current = {kind: "paint", last: at.cell, group};
      } else if (ui.tool === "fill" && inside) {
        change((d) => d.fill(...at.cell, ui.terrain));
      } else if (ui.tool === "trail") {
        trailDown(at);
      }
      return true;
    }
    // drag
    const drag = dragRef.current;
    if (drag?.kind === "paint" && inside) {
      if (at.cell[0] !== drag.last[0] || at.cell[1] !== drag.last[1]) paintAlong(drag.last, at.cell, drag.group);
      drag.last = at.cell;
      if (at.cell[0] !== ui.hover?.[0] || at.cell[1] !== ui.hover?.[1]) update({hover: at.cell});
    } else if (drag?.kind === "trail-point") {
      change((d) => d.moveTrailPoint(drag.trail, drag.point, at.point), {group: drag.group});
    }
    return true;
  }

  // What MapCanvas needs to show the cells as the ground (ground), and to
  // edit them (canvas, for the Cells tab).
  const ground = draft && {
    image: {url: `cellmap:${mapKey}`, pixelDimensions},
    feetDimensions: size,
    background: <RenderBackground image={render?.image} {...pixelDimensions} />,
    rendered: render?.image ?? null,
  };
  const canvas = ground && {
    ...ground,
    overlay: (
      <>
        <CellOverlay draft={draft} renderedCells={render?.cellMap.cells} ui={ui} scale={scale} {...pixelDimensions} />
        <BrushOverlay draft={draft} ui={ui} scale={scale} {...pixelDimensions} />
      </>
    ),
    onPointer,
    cursor: ui.tool === "pan" ? "grab" : "crosshair",
  };

  return {history, draft, change, ui, update, render, errors, pending, ground, canvas};
}

const THUMBNAIL_DELAY_MS = 1500;
const THUMBNAIL_MAX_DIMENSION = 256;

// A small webp of the latest render, a moment after edits stop.
function useThumbnail(render, onThumbnail) {
  const onThumbnailRef = useRef(onThumbnail);
  onThumbnailRef.current = onThumbnail;
  useEffect(() => {
    if (!render) return undefined;
    const timer = setTimeout(() => {
      const {image} = render;
      const shrink = Math.min(1, THUMBNAIL_MAX_DIMENSION / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * shrink));
      canvas.height = Math.max(1, Math.round(image.height * shrink));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob && onThumbnailRef.current?.(blob), "image/webp");
    }, THUMBNAIL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [render]);
}

// The last render, stretched to the current size while a resize renders.
function RenderBackground({image, width, height}) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
  }, [image]);
  return <canvas ref={ref} className="map-canvas-cell-render" style={{width, height}} />;
}

// Sizes an overlay canvas to the map at the overlay's resolution and sets
// it up to draw in feet.
function overlayContext(canvas, {width, height, scale}) {
  const ctx = canvas?.getContext("2d");
  if (!ctx) return {};
  const overlayScale = Math.min(scale, OVERLAY_PIXELS_PER_FOOT);
  canvas.width = Math.round((width / scale) * overlayScale);
  canvas.height = Math.round((height / scale) * overlayScale);
  ctx.setTransform(overlayScale, 0, 0, overlayScale, 0, 0);
  return {ctx, overlayScale};
}

function CellOverlay({draft, renderedCells, ui, scale, width, height}) {
  const ref = useRef(null);
  const map = draft.data;
  const {overlay, tool, selected, pendingPoint} = ui;
  useEffect(() => {
    const {ctx, overlayScale} = overlayContext(ref.current, {width, height, scale});
    if (!ctx) return;
    if (overlay !== "none") drawCells(ctx, map, overlayScale, {filled: overlay === "cells"});
    // Cells edited since the last render, until the next one shows them.
    if (renderedCells && overlay !== "cells" && map.cells.some((line, r) => line !== renderedCells[r])) {
      drawCells(ctx, map, overlayScale, {filled: true, outline: false, only: (col, row) => renderedCells[row]?.[col] !== map.cells[row][col]});
    }
    if (tool === "trail" || overlay === "cells") drawTrails(ctx, map, overlayScale, {selected: tool === "trail" ? selected : null});
    if (pendingPoint) {
      const p = cellPoint(...pendingPoint, map.grid.cellSize);
      ctx.fillStyle = SELECTED_COLOR;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9 / overlayScale, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [map, renderedCells, overlay, tool, selected, pendingPoint, scale, width, height]);
  return <canvas ref={ref} className="map-canvas-cell-overlay" style={{width, height}} />;
}

// The cells a paint or fill would change, under the pointer.
function BrushOverlay({draft, ui, scale, width, height}) {
  const ref = useRef(null);
  const {hover, tool, brush} = ui;
  useEffect(() => {
    const {ctx, overlayScale} = overlayContext(ref.current, {width, height, scale});
    if (!ctx || !hover || (tool !== "paint" && tool !== "fill")) return;
    const reach = tool === "paint" ? brush - 1 : 0;
    const [hc, hr] = hover;
    ctx.strokeStyle = SELECTED_COLOR;
    ctx.lineWidth = 2 / overlayScale;
    ctx.beginPath();
    for (let c = hc - reach; c <= hc + reach; c++) {
      for (let r = hr - reach - 1; r <= hr + reach + 1; r++) {
        if (draft.inside(c, r) && hexDistance([hc, hr], [c, r]) <= reach) hexPath(ctx, c, r, draft.grid.cellSize);
      }
    }
    ctx.stroke();
  }, [draft, hover, tool, brush, scale, width, height]);
  return <canvas ref={ref} className="map-canvas-cell-overlay" style={{width, height}} />;
}
