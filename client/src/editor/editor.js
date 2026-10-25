import { MapView } from "./mapView.js";
import { cornerCount, labelPoint, nearestEdge, resubtract, rings, snapToCell, subtractZones, tilesTouched } from "./region.js";
import { createZone, listZones, saveZone } from "./zones.js";

const HIT_PX = 8;
const COLORS = {
  active: "#f0c850",
  activeFill: "rgba(240, 200, 80, 0.16)",
  editable: "rgba(240, 200, 80, 0.35)",
  locked: "rgba(255, 255, 255, 0.55)",
  lockedFill: "rgba(255, 255, 255, 0.07)",
};
const HINTS = {
  none: "pick a zone to edit, or make a new one · drag to pan · wheel to zoom",
  draw: "click to add corners · click the first corner or press enter to close · backspace removes the last · esc cancels · right-drag to pan",
  edit: "drag corners · shift-click an edge to add a corner · alt-click a corner to remove it · drag elsewhere to pan",
};

// Ties the map, the side panel and the in-memory world together. One zone at a time is active and
// editable; every other zone on the continent shows but is locked.
export class Editor {
  constructor(world, elements) {
    this.world = world;
    this.el = elements;
    this.continent = world.info.continents[0].key;
    this.zones = [];
    this.active = null;
    this.drawing = null; // corners of a region being drawn
    this.dirty = false;

    this.map = new MapView(elements.map, {
      onPointer: ([x, z]) => (elements.cursor.textContent = `tile ${Math.floor(x)}, ${Math.floor(z)}`),
      draw: (ctx, map) => this.draw(ctx, map),
      tool: () => this.tool(),
    });

    this.bindPanel();
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("beforeunload", (e) => {
      if (this.dirty) e.preventDefault();
    });
    this.reload();
  }

  get activeZone() {
    return this.zones.find((z) => z.key === this.active) ?? null;
  }

  reload() {
    this.zones = listZones(this.world, this.continent);
    if (!this.activeZone) this.active = null;
    this.renderPanel();
    this.map.render();
  }

  save(zone) {
    saveZone(this.world, this.continent, zone);
    this.dirty = true;
    this.renderPanel();
    this.map.render();
  }

  markSaved() {
    this.dirty = false;
  }

  say(text) {
    this.el.message.textContent = text ?? "";
  }

  otherZones(zone) {
    return this.zones.filter((z) => z.key !== zone.key && z.region.length);
  }

  // Where a corner lands: on another zone's corner or edge when it's near one, so neighbours
  // share boundaries exactly, and otherwise on the nearest cell corner.
  snap(tile, zone) {
    const others = this.otherZones(zone);
    for (const other of others) {
      for (const { points } of rings(other.region)) {
        const corner = points.find((p) => this.nearScreen(p, tile));
        if (corner) return [...corner];
      }
    }
    for (const other of others) {
      const edge = nearestEdge(other.region, tile);
      if (edge.dist * this.map.view.scale < HIT_PX * this.map.dpr) return edge.point;
    }
    return snapToCell(tile);
  }

  // The zone's region with every other zone cut out of it, or null (with a message) when nothing
  // would be left.
  clip(region, zone) {
    const others = this.otherZones(zone).map((z) => z.region);
    const result = resubtract(region, others);
    if (result.length) return result;
    this.say("Other zones cover all of that; nothing would be left.");
    return null;
  }

  // --- panel ---

  bindPanel() {
    const { continent, newZone, zoneName, drawRegion } = this.el;
    continent.innerHTML = "";
    for (const c of this.world.info.continents) continent.add(new Option(c.name, c.key));
    continent.addEventListener("change", () => {
      this.continent = continent.value;
      this.active = null;
      this.drawing = null;
      this.reload();
    });

    newZone.addEventListener("click", () => {
      const name = window.prompt("Zone name")?.trim();
      if (!name) return;
      const zone = createZone(this.world, this.continent, name);
      this.dirty = true;
      this.active = zone.key;
      this.drawing = [];
      this.reload();
    });

    zoneName.addEventListener("input", () => {
      const zone = this.activeZone;
      if (!zone) return;
      zone.name = zoneName.value;
      this.save(zone);
    });

    drawRegion.addEventListener("click", () => {
      const zone = this.activeZone;
      if (!zone) return;
      if (zone.region.length && !window.confirm("Replace this zone's region?")) return;
      this.drawing = [];
      this.renderPanel();
    });
  }

  renderPanel() {
    const { zoneList, zonePanel, zoneName, regionInfo, drawRegion, hint } = this.el;
    zoneList.innerHTML = "";
    for (const zone of this.zones) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = zone.name || zone.key;
      button.classList.toggle("active", zone.key === this.active);
      button.addEventListener("click", () => {
        this.active = zone.key === this.active ? null : zone.key;
        this.drawing = null;
        this.say();
        this.renderPanel();
        this.map.render();
      });
      item.append(button);
      zoneList.append(item);
    }
    if (!this.zones.length) zoneList.innerHTML = '<li class="editor-empty">no zones yet</li>';

    const zone = this.activeZone;
    zonePanel.hidden = !zone;
    if (zone) {
      if (document.activeElement !== zoneName) zoneName.value = zone.name;
      const tiles = tilesTouched(zone.region).length;
      const pieces = zone.region.length > 1 ? ` · ${zone.region.length} pieces` : "";
      regionInfo.textContent = zone.region.length
        ? `${cornerCount(zone.region)} corners${pieces} · ${tiles} editable tiles`
        : "no region yet";
      drawRegion.textContent = zone.region.length ? "redraw region" : "draw region";
    }
    hint.textContent = HINTS[this.mode()];
  }

  mode() {
    if (!this.activeZone) return "none";
    return this.drawing ? "draw" : "edit";
  }

  // --- tools ---

  tool() {
    const zone = this.activeZone;
    if (!zone) return null;
    if (this.drawing) return this.drawTool(zone);
    if (zone.region.length) return this.editTool(zone);
    return null;
  }

  drawTool(zone) {
    return {
      down: (tile) => {
        const pts = this.drawing;
        if (pts.length >= 3 && this.nearScreen(pts[0], tile)) {
          this.finishDrawing(zone);
        } else {
          pts.push(this.snap(tile, zone));
          this.say();
        }
        return true;
      },
    };
  }

  // Corners are addressed as { poly, ring, index } within the region. Every change re-cuts the
  // other zones out of the region when the drag ends.
  editTool(zone) {
    const cornerAt = (tile) => {
      for (const { poly, ring, points } of rings(zone.region)) {
        const index = points.findIndex((p) => this.nearScreen(p, tile));
        if (index >= 0) return { poly, ring, index };
      }
      return null;
    };
    const ringOf = ({ poly, ring }) => zone.region[poly][ring];

    return {
      down: (tile, e) => {
        let corner = cornerAt(tile);
        if (corner && e.altKey) {
          if (ringOf(corner).length <= 3) return true;
          const edited = structuredClone(zone.region);
          edited[corner.poly][corner.ring].splice(corner.index, 1);
          const clipped = this.clip(edited, zone);
          if (clipped) {
            zone.region = clipped;
            this.save(zone);
          }
          return true;
        }
        if (!corner && e.shiftKey) {
          const edge = nearestEdge(zone.region, tile);
          if (edge.dist * this.map.view.scale > HIT_PX * this.map.dpr) return false;
          corner = { poly: edge.poly, ring: edge.ring, index: edge.index + 1 };
          ringOf(corner).splice(corner.index, 0, edge.point);
        }
        if (!corner) return false;
        this.dragging = { corner, before: structuredClone(zone.region) };
        return true;
      },
      move: (tile) => {
        const { corner } = this.dragging;
        ringOf(corner)[corner.index] = this.snap(tile, zone);
      },
      up: () => {
        const clipped = this.clip(zone.region, zone);
        zone.region = clipped ?? this.dragging.before;
        if (clipped) this.say();
        this.dragging = null;
        this.save(zone);
      },
    };
  }

  finishDrawing(zone) {
    if (this.drawing.length < 3) return;
    const others = this.otherZones(zone).map((z) => z.region);
    const region = subtractZones(this.drawing, others);
    if (!region.length) {
      this.say("Other zones cover all of that region; move corners outside them before closing it.");
      return;
    }
    this.say(region.length > 1 ? `Other zones split this region into ${region.length} pieces.` : "");
    zone.region = region;
    this.drawing = null;
    this.save(zone);
  }

  onKey(e) {
    if (e.target.matches("input, textarea, select") || !this.drawing) return;
    const zone = this.activeZone;
    if (e.key === "Enter") this.finishDrawing(zone);
    if (e.key === "Escape") this.drawing = null;
    if (e.key === "Backspace") this.drawing.pop();
    this.renderPanel();
    this.map.render();
  }

  nearScreen(point, tile) {
    const [ax, ay] = this.map.toScreen(point);
    const [bx, by] = this.map.toScreen(tile);
    return Math.hypot(ax - bx, ay - by) < HIT_PX * this.map.dpr;
  }

  // --- drawing ---

  draw(ctx, map) {
    const dpr = map.dpr;
    for (const zone of this.zones) {
      if (zone.key !== this.active) this.drawRegion(ctx, map, zone, false);
    }
    const zone = this.activeZone;
    if (!zone) return;

    ctx.strokeStyle = COLORS.editable;
    ctx.lineWidth = dpr;
    for (const [tx, tz] of tilesTouched(zone.region)) {
      const [sx, sy] = map.toScreen([tx, tz]);
      ctx.strokeRect(sx + 2 * dpr, sy + 2 * dpr, map.view.scale - 4 * dpr, map.view.scale - 4 * dpr);
    }
    if (!this.drawing) {
      this.drawRegion(ctx, map, zone, true);
      return;
    }

    const pts = this.drawing.map((p) => map.toScreen(p));
    if (map.pointer) pts.push(map.toScreen(this.snap(map.pointer, zone)));
    ctx.strokeStyle = COLORS.active;
    ctx.lineWidth = 2 * dpr;
    polyline(ctx, pts, false);
    this.drawing.forEach((p, i) => handle(ctx, map.toScreen(p), (i === 0 ? 6 : 4) * dpr, COLORS.active));
  }

  drawRegion(ctx, map, zone, active) {
    if (!zone.region.length) return;
    const dpr = map.dpr;
    const all = rings(zone.region).map((r) => r.points.map((p) => map.toScreen(p)));
    ctx.beginPath();
    for (const pts of all) {
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    }
    ctx.fillStyle = active ? COLORS.activeFill : COLORS.lockedFill;
    ctx.fill("evenodd");
    ctx.strokeStyle = active ? COLORS.active : COLORS.locked;
    ctx.lineWidth = (active ? 2 : 1.5) * dpr;
    ctx.setLineDash(active ? [] : [6 * dpr, 4 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (active) all.flat().forEach((p) => handle(ctx, p, 4 * dpr, COLORS.active));

    const [cx, cy] = map.toScreen(labelPoint(zone.region));
    ctx.fillStyle = active ? COLORS.active : COLORS.locked;
    ctx.font = `${13 * dpr}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.fillText(zone.name || zone.key, cx, cy);
    ctx.textAlign = "start";
  }
}

function polyline(ctx, pts, closed) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (closed) ctx.closePath();
  ctx.stroke();
}

function handle(ctx, [x, y], r, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}
