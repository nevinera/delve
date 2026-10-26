import { snapToCell } from "./region.js";
import { CART_WIDTH_FT, gradeCap, splitRoute } from "./roads.js";
import { TILE_FT } from "../world/constants.js";

// The continent's sketch (zones.js loadSketch): pins ({ id, kind, at, ... }) and road paths ({ id,
// from, to, width, ... }) anywhere on its land, in continent tile units with sizes in feet. Height
// pins set the ground height at a spot; biome pins claim the land around them for a biome,
// adjusted by their tags; info pins carry a name, notes and tags for people and LLMs and don't
// affect generation. Water source pins send water downhill, making the sketch's watercourses
// (waterflow.js). Road pins are joined by paths, each routed over the land between its two pins
// (roads.js); a road is a run of paths. Roads and hubs don't shape the ground yet. There are no
// coastlines: the sea is wherever no zone is.

export const PINS = {
  height: { color: "#70d070", label: "height pin" },
  biome: { color: "#e0a040", label: "biome pin" },
  road: { color: "#c8a26a", label: "road pin", tool: "road" },
  hub: { color: "#e05a5a", label: "hub" },
  info: { color: "#b08ae0", label: "info pin" },
  source: { color: "#3fb6ff", label: "water source" },
};
const RIVER_COLOR = "#4a90d9";
const PATH = { color: "#c8a26a", none: "#ff4a4a", pending: "rgba(255, 255, 255, 0.6)", label: "road path" };
const POOL_COLOR = "rgba(74, 144, 217, 0.8)";
export const FEATURE_HINTS = {
  select: "click a pin or road to select it · drag pins, and a selected hub's edge to size it · delete removes the selection",
  pin: "click on land to place · click a pin to select or drag it · drag a selected hub's edge to size it",
  road: "click on land to place a road pin, joined to the selected one · click a road pin to join it, or drag it · click a road to branch off it · esc starts a new road · set the width under the selected pin, or select a single path with the select tool · roads don't shape the ground yet",
};

const DEFAULT_HEIGHT_FT = 20;
const DEFAULT_HUB_RADIUS_FT = 200;
const MIN_HUB_RADIUS_FT = 16;
const DEFAULT_SOURCE_WIDTH_FT = 12;
const DEFAULT_PATH_WIDTH_FT = 10;
const SHAPE_PINS = ["height", "biome"];

export function nextId(sketch, prefix) {
  const used = new Set([...sketch.pins, ...sketch.paths].map((f) => f.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

// Tools, drawing and the properties panel for the sketch's features. The editor keeps the sketch
// (editor.sketch) and stores it (editor.saveSketch), and works out the paths' routes
// (editor.routeKey says which route a path needs).
export class Features {
  constructor(editor) {
    this.editor = editor;
    this.selected = null; // { type: "pin" | "path", id }
    this.kinds = []; // what the current tool can pick
  }

  get map() {
    return this.editor.map;
  }

  // The selected feature.
  find(sketch) {
    if (!this.selected) return null;
    const list = this.selected.type === "pin" ? sketch.pins : sketch.paths;
    return list.find((f) => f.id === this.selected.id) ?? null;
  }

  select(sketch, type, id) {
    this.selected = sketch && type ? { type, id } : null;
    this.editor.renderProps();
  }

  isSelected(feature) {
    return this.selected?.id === feature.id;
  }

  // Removes the selection, and a pin's paths with it.
  remove(sketch) {
    const feature = this.find(sketch);
    if (!feature) return;
    if (this.selected.type === "pin") {
      sketch.pins.splice(sketch.pins.indexOf(feature), 1);
      sketch.paths = sketch.paths.filter((p) => p.from !== feature.id && p.to !== feature.id);
    } else {
      sketch.paths.splice(sketch.paths.indexOf(feature), 1);
    }
    this.select(null);
    this.editor.saveSketch();
  }

  // --- tools ---

  // `kinds` limits what the select tool picks, and what a pin tool's click can grab.
  tool(sketch, name, kinds) {
    this.kinds = kinds ?? Object.keys(PINS);
    if (name === "road") return this.roadTool(sketch);
    if (PINS[name]) return this.pinTool(sketch, name);
    return this.selectTool(sketch);
  }

  // A spot for a feature, snapped to the cell grid, on land. Null (with a message) for a spot it
  // can't go.
  place(tile) {
    const point = snapToCell(tile);
    if (this.editor.onLand(point)) return point;
    this.editor.say("Features go on land, inside some zone.");
    return null;
  }

  pinTool(sketch, kind) {
    return {
      down: (tile) => {
        if (this.grabHandle(sketch, tile)) return true;
        const existing = this.pinAt(sketch, tile);
        if (existing) return this.grabPin(sketch, existing);
        this.addPin(sketch, kind, tile, this.editor.palette.pinProps(kind));
        return true;
      },
      move: (tile) => this.dragTo(tile, sketch),
      up: () => this.endDrag(sketch),
    };
  }

  // Places a pin with the given settings. Height and biome pins are dropped many at a time, so
  // placing one doesn't select it (and clears any selection, so the palette applies to new pins);
  // other pins are selected so their details can be filled in.
  addPin(sketch, kind, tile, props = {}) {
    const at = this.place(tile);
    if (!at) return;
    const pin = { id: nextId(sketch, "p"), kind, at, ...props };
    if (kind === "height") pin.height ??= DEFAULT_HEIGHT_FT;
    if (kind === "hub") pin.radius ??= DEFAULT_HUB_RADIUS_FT;
    if (kind === "source") pin.width ??= DEFAULT_SOURCE_WIDTH_FT;
    sketch.pins.push(pin);
    this.select(sketch, SHAPE_PINS.includes(kind) ? null : "pin", pin.id);
    this.editor.saveSketch();
  }

  // Each click places a road pin, or picks one, and joins it to the road pin selected before, so a
  // run of clicks draws a road. A click on a road puts a pin on it there, to branch from.
  roadTool(sketch) {
    return {
      down: (tile) => {
        const selected = this.selected?.type === "pin" ? this.find(sketch) : null;
        const from = selected?.kind === "road" ? selected : null;
        const existing = this.pinAt(sketch, tile, ["road"]);
        if (existing && (!from || existing === from)) return this.grabPin(sketch, existing);
        let pin = existing;
        if (!pin) {
          const path = this.pathAt(sketch, tile);
          if (path) {
            pin = this.splitAt(sketch, path, tile);
          } else {
            const at = this.place(tile);
            if (!at) return true;
            pin = { id: nextId(sketch, "p"), kind: "road", at };
            sketch.pins.push(pin);
          }
        }
        if (from) this.join(sketch, from, pin);
        this.select(sketch, "pin", pin.id);
        this.editor.saveSketch();
        return true;
      },
      move: (tile) => this.dragTo(tile, sketch),
      up: () => this.endDrag(sketch),
    };
  }

  // A path from road pin `a` to `b`, as wide and tagged as another of a's paths, unless they're
  // joined already.
  join(sketch, a, b) {
    if (sketch.paths.some((p) => (p.from === a.id && p.to === b.id) || (p.from === b.id && p.to === a.id))) return;
    const like = sketch.paths.find((p) => p.from === a.id || p.to === a.id);
    const path = { id: nextId(sketch, "r"), from: a.id, to: b.id, width: like?.width ?? DEFAULT_PATH_WIDTH_FT };
    if (like?.tags) path.tags = [...like.tags];
    sketch.paths.push(path);
  }

  // A new road pin on a path, nearest the given spot, splitting the path in two there.
  splitAt(sketch, path, tile) {
    const points = this.pathPoints(sketch, path);
    const { index } = nearestOnStroke(points, tile);
    const pin = { id: nextId(sketch, "p"), kind: "road", at: snapToCell(closestOnSegment(points[index], points[index + 1], tile)) };
    sketch.pins.push(pin);
    this.splitPath(sketch, path, index, pin);
    return pin;
  }

  // Splits a path at `pin`, which lies on segment `index` of its route: the path runs to the pin,
  // and a new one like it runs on from there. A route that's up to date is cut in two, so neither
  // half needs working out again.
  splitPath(sketch, path, index, pin) {
    const { route, ...rest } = path;
    const current = route?.points && route.key === this.editor.routeKey(path);
    const next = { ...structuredClone(rest), id: nextId(sketch, "r"), from: pin.id };
    path.to = pin.id;
    sketch.paths.push(next);
    delete path.route;
    if (!current) return;
    const halves = splitRoute(route.points, index, pin.at);
    for (const [p, points] of [[path, halves[0]], [next, halves[1]]]) {
      p.route = { key: this.editor.routeKey(p), points, lengthFt: Math.round(lengthOf(points) * TILE_FT), grade: route.grade };
    }
  }

  selectTool(sketch) {
    return {
      down: (tile) => {
        if (this.grabHandle(sketch, tile)) return true;
        const pin = this.pinAt(sketch, tile);
        if (pin) return this.grabPin(sketch, pin);
        const path = this.kinds.includes("road") ? this.pathAt(sketch, tile) : null;
        this.select(sketch, path ? "path" : null, path?.id);
        return Boolean(path);
      },
      move: (tile) => this.dragTo(tile, sketch),
      up: () => this.endDrag(sketch),
    };
  }

  endDrag(sketch) {
    if (!this.dragging) return;
    const sized = this.dragging.key === "radius";
    this.dragging = null;
    this.editor.saveSketch();
    if (sized) this.editor.renderProps();
  }

  // The selected hub's handle, on its edge to the east, for sizing it.
  handleOf(sketch) {
    const pin = this.selected?.type === "pin" ? this.find(sketch) : null;
    if (pin?.kind !== "hub" || !this.kinds.includes("hub")) return null;
    return { pin, at: [pin.at[0] + (pin.radius ?? 0) / TILE_FT, pin.at[1]] };
  }

  grabHandle(sketch, tile) {
    const handle = this.handleOf(sketch);
    // Where the handle's on top of the pin, the pin wins, so it can still be moved.
    if (!handle || !this.editor.nearScreen(handle.at, tile) || this.editor.nearScreen(handle.pin.at, tile)) return false;
    this.dragging = { target: handle.pin, key: "radius", kind: "hub" };
    return true;
  }

  grabPin(sketch, pin) {
    this.select(sketch, "pin", pin.id);
    this.dragging = { target: pin, key: "at", kind: pin.kind };
    return true;
  }

  dragTo(tile, sketch) {
    if (!this.dragging) return;
    const { target, key } = this.dragging;
    if (key === "radius") {
      const ft = Math.hypot(tile[0] - target.at[0], tile[1] - target.at[1]) * TILE_FT;
      target.radius = Math.max(MIN_HUB_RADIUS_FT, Math.round(ft));
      return;
    }
    const point = snapToCell(tile);
    if (!this.editor.onLand(point)) return;
    this.dragging.target[this.dragging.key] = point;
  }

  pinAt(sketch, tile, kinds = this.kinds) {
    return [...sketch.pins].reverse().find((p) => kinds.includes(p.kind) && this.editor.nearScreen(p.at, tile)) ?? null;
  }

  pathAt(sketch, tile) {
    return (
      [...sketch.paths].reverse().find((p) => {
        const reach = Math.max(8 * this.map.dpr, (p.width / 2 / TILE_FT) * this.map.view.scale);
        return nearestOnStroke(this.pathPoints(sketch, p), tile).dist * this.map.view.scale < reach;
      }) ?? null
    );
  }

  // Where a path runs: its route, or straight between its pins while it has none.
  pathPoints(sketch, path) {
    if (path.route?.points) return path.route.points;
    const pin = (id) => sketch.pins.find((p) => p.id === id)?.at ?? [0, 0];
    return [pin(path.from), pin(path.to)];
  }

  // "routed", "none" when there's no route within its grade cap, or "pending" while it's being
  // worked out.
  pathState(path) {
    if (!path.route || path.route.key !== this.editor.routeKey(path)) return "pending";
    return path.route.points ? "routed" : "none";
  }

  onKey(e, sketch) {
    if ((e.key === "Delete" || e.key === "Backspace") && this.selected) {
      this.remove(sketch);
      return true;
    }
    if (e.key === "Escape" && this.selected) {
      this.select(null);
      return true;
    }
    return false;
  }

  // --- drawing ---

  // Draws the sketch's features of the given kinds (paths with road pins), and its rivers and
  // pools when `water` is set.
  draw(ctx, sketch, { kinds, water = false }) {
    if (water) this.drawWater(ctx, sketch.watercourses);
    if (kinds.includes("road")) for (const path of sketch.paths) this.drawPath(ctx, sketch, path);
    for (const pin of sketch.pins) {
      if (kinds.includes(pin.kind)) this.drawPin(ctx, pin, this.isSelected(pin));
    }
    const handle = this.handleOf(sketch);
    if (handle) {
      const dpr = this.map.dpr;
      const [x, y] = this.map.toScreen(handle.at);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = dpr;
      ctx.fillRect(x - 4 * dpr, y - 4 * dpr, 8 * dpr, 8 * dpr);
      ctx.strokeRect(x - 4 * dpr, y - 4 * dpr, 8 * dpr, 8 * dpr);
      if (this.dragging?.key === "radius") {
        ctx.fillStyle = "#eee";
        ctx.font = `${12 * dpr}px ui-monospace, monospace`;
        ctx.fillText(`${handle.pin.radius} ft`, x + 8 * dpr, y + 4 * dpr);
      }
    }
  }

  // The watercourses' pools and rivers.
  drawWater(ctx, { rivers, pools }) {
    ctx.fillStyle = POOL_COLOR;
    ctx.strokeStyle = POOL_COLOR;
    ctx.lineWidth = this.map.dpr;
    for (const { region } of pools) {
      ctx.beginPath();
      for (const ring of region.flat()) {
        ring.forEach((p, i) => (i ? ctx.lineTo(...this.map.toScreen(p)) : ctx.moveTo(...this.map.toScreen(p))));
        ctx.closePath();
      }
      ctx.fill("evenodd");
      ctx.stroke();
    }
    for (const river of rivers) this.drawLine(ctx, river.points, river.width, RIVER_COLOR);
  }

  // A path along its route; while it's worked out, its old route faded or a dashed line between
  // its pins, and with no route, a red dashed line.
  drawPath(ctx, sketch, path) {
    const dpr = this.map.dpr;
    const state = this.pathState(path);
    const points = this.pathPoints(sketch, path);
    if (state === "routed" || (state === "pending" && path.route?.points)) {
      ctx.globalAlpha = state === "routed" ? 1 : 0.5;
      this.drawLine(ctx, points, path.width, PATH.color);
      ctx.globalAlpha = 1;
    } else {
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      this.drawLine(ctx, points, 0, state === "none" ? PATH.none : PATH.pending);
      ctx.setLineDash([]);
    }
    if (this.isSelected(path)) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = dpr;
      polyline(ctx, points.map((p) => this.map.toScreen(p)));
    }
  }

  drawLine(ctx, points, widthFt, color) {
    const pts = points.map((p) => this.map.toScreen(p));
    if (!pts.length) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2 * this.map.dpr, (widthFt / TILE_FT) * this.map.view.scale);
    polyline(ctx, pts);
  }

  drawPin(ctx, pin, highlight) {
    const dpr = this.map.dpr;
    const [x, y] = this.map.toScreen(pin.at);
    const r = (pin.kind === "road" ? 5 : 7) * dpr;
    if (pin.kind === "hub" && pin.radius > 0) {
      // The ground a hub takes up.
      ctx.strokeStyle = PINS.hub.color;
      ctx.lineWidth = dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.arc(x, y, (pin.radius / TILE_FT) * this.map.view.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = PINS[pin.kind].color;
    ctx.strokeStyle = highlight ? "#fff" : "#000";
    ctx.lineWidth = (highlight ? 2 : 1) * dpr;
    ctx.beginPath();
    if (pin.kind === "source") {
      // A drop.
      ctx.moveTo(x, y - r * 1.2);
      ctx.quadraticCurveTo(x + r, y, x, y + r * 0.8);
      ctx.quadraticCurveTo(x - r, y, x, y - r * 1.2);
    } else if (pin.kind === "biome") {
      ctx.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
    } else if (pin.kind === "height") {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    } else {
      ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    const label =
      pin.kind === "height"
        ? `${pin.height ?? "?"}ft`
        : pin.kind === "biome"
          ? [pin.biome, ...(pin.tags ?? [])].join(" · ")
          : pin.kind === "source"
            ? [pin.name, `${pin.width}ft`].filter(Boolean).join(" · ")
            : pin.name || (pin.tags ?? []).join(", ");
    if (label) {
      ctx.fillStyle = "#eee";
      ctx.font = `${12 * dpr}px ui-monospace, monospace`;
      ctx.fillText(label, x + r + 3 * dpr, y + 4 * dpr);
    }
  }

  // --- properties panel ---

  renderProps(box, sketch) {
    box.innerHTML = "";
    this.status = null;
    const feature = sketch && this.find(sketch);
    if (!feature) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const path = this.selected.type === "path";
    const label = path ? PATH.label : PINS[feature.kind].label;
    const heading = document.createElement("h2");
    heading.textContent = `${label} · ${feature.id}`;
    box.append(heading);

    // Height and biome settings live in the shape palette.
    const fields = ["name"];
    if (path || feature.kind === "source") fields.push("width");
    if (feature.kind === "hub") fields.push("radius");
    if (path || !SHAPE_PINS.includes(feature.kind)) fields.push("tags");
    fields.push("notes");
    for (const key of fields) box.append(this.field(sketch, feature, key));
    if (feature.kind === "road") box.append(this.roadWidthField(sketch, feature));
    if (feature.kind === "source") box.append(this.editor.sourceStatus(feature));
    if (path) {
      this.status = { path: feature, el: document.createElement("p") };
      box.append(this.status.el);
      this.renderStatus();
    }

    const row = document.createElement("div");
    row.className = "editor-row";
    row.append(button(`delete ${label}`, () => this.remove(sketch)));
    box.append(row);
  }

  // A line under a path's settings saying how its route went.
  renderStatus() {
    const { path, el } = this.status ?? {};
    if (!el) return;
    const cap = `${Math.round(gradeCap(path.width) * 100)}%`;
    const carts = path.width > CART_WIDTH_FT ? "it's wide enough for carts, so it's held to" : "its grade cap is";
    el.textContent = {
      routed: `Runs ${path.route?.lengthFt?.toLocaleString()} ft, climbing ${Math.round((path.route?.grade ?? 0) * 100)}% at most (${carts} ${cap}).`,
      none: `No route within a ${cap} grade without crossing a lake or the sea, or a river at an angle, so it's shown as a red dashed line.`,
      pending: "Working out its route…",
    }[this.pathState(path)];
  }

  // A road pin's paths' width, set for them all at once. New paths from the pin take it too, so
  // setting it while drawing carries on down the road. Blank when its paths differ.
  roadWidthField(sketch, pin) {
    const paths = () => sketch.paths.filter((p) => p.from === pin.id || p.to === pin.id);
    const label = document.createElement("label");
    label.className = "editor-field";
    label.textContent = "road width (ft), for its paths";
    const input = document.createElement("input");
    input.type = "number";
    const widths = new Set(paths().map((p) => p.width));
    input.value = widths.size === 1 ? [...widths][0] : "";
    input.disabled = !widths.size;
    input.addEventListener("input", () => {
      const width = Number(input.value);
      if (!input.value.trim() || !(width > 0)) return;
      for (const path of paths()) path.width = width;
      this.editor.saveSketch();
    });
    label.append(input);
    return label;
  }

  field(sketch, feature, key) {
    const label = document.createElement("label");
    label.className = "editor-field";
    const width = feature.kind === "source" ? "flow: river width (ft)" : "width (ft)";
    label.textContent = { width, radius: "radius (ft)", tags: "tags (comma-separated)" }[key] ?? key;
    const numeric = key === "width" || key === "radius";
    const input = document.createElement(key === "notes" ? "textarea" : "input");
    if (key === "notes") input.rows = 4;
    else input.type = numeric ? "number" : "text";
    input.value = key === "tags" ? (feature.tags ?? []).join(", ") : (feature[key] ?? "");
    input.addEventListener("input", () => {
      const value = input.value.trim();
      if (key === "tags") {
        const tags = value.split(",").map((t) => t.trim()).filter(Boolean);
        if (tags.length) feature.tags = tags;
        else delete feature.tags;
      } else if (value === "") {
        if (!numeric) delete feature[key];
      } else {
        feature[key] = numeric ? Number(value) : input.value;
      }
      this.editor.saveSketch();
      this.renderStatus();
    });
    label.append(input);
    return label;
  }
}

// The segment of a line nearest a point: the index of its first point, and the distance.
export function nearestOnStroke(points, [x, z]) {
  let best = { index: -1, dist: Infinity };
  for (let i = 1; i < points.length; i++) {
    const [px, pz] = closestOnSegment(points[i - 1], points[i], [x, z]);
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best.dist) best = { index: i - 1, dist };
  }
  return best;
}

function closestOnSegment([ax, az], [bx, bz], [x, z]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return [ax + t * dx, az + t * dz];
}

function lengthOf(points) {
  let length = 0;
  for (let k = 1; k < points.length; k++) length += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
  return length;
}

function polyline(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

function button(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
