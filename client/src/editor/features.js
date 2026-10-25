import { snapToCell } from "./region.js";
import { TILE_FT } from "../world/constants.js";
import { BIOMES } from "../world/biomes.js";

// A zone's sketch features: pins ({ id, kind, at, ... }) and strokes ({ id, kind, points, width,
// ... }), in continent tile units with sizes in feet. Height pins set the ground height at a spot;
// biome pins claim the land around them for a biome, adjusted by their tags; info pins carry a
// name, notes and tags for people and LLMs and don't affect generation. Rivers
// flow the way they're drawn. There are no coastlines: the sea is wherever no zone is.

export const PINS = {
  height: { color: "#70d070", label: "height pin" },
  biome: { color: "#e0a040", label: "biome pin" },
  info: { color: "#b08ae0", label: "info pin" },
};
export const STROKES = {
  river: { color: "#4a90d9", width: 30, label: "river" },
};
export const FEATURE_TOOLS = ["select", ...Object.keys(PINS), ...Object.keys(STROKES)];
export const FEATURE_HINTS = {
  select: "click a pin or line to select it · drag pins and line points · shift-click a selected line to add a point · alt-click a point to remove it · delete removes the selection",
  pin: "click inside the zone to place · click a pin to select or drag it",
  stroke: "click inside the zone to add points · click the last point or press enter to finish · backspace removes the last · esc cancels · right-drag to pan",
};

const DEFAULT_HEIGHT_FT = 20;
const DEFAULT_BIOME_PIN = "forest";

export function nextId(zone, prefix) {
  const used = new Set([...zone.pins, ...zone.strokes].map((f) => f.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

// Tools, drawing and the properties panel for the active zone's features.
export class Features {
  constructor(editor) {
    this.editor = editor;
    this.selected = null; // { type: "pin" | "stroke", id }
    this.stroke = null; // a stroke being drawn: { kind, points }
  }

  get map() {
    return this.editor.map;
  }

  find(zone) {
    if (!this.selected) return null;
    const list = this.selected.type === "pin" ? zone.pins : zone.strokes;
    return list.find((f) => f.id === this.selected.id) ?? null;
  }

  select(type, id) {
    this.selected = type ? { type, id } : null;
    this.editor.renderProps();
  }

  remove(zone) {
    const feature = this.find(zone);
    if (!feature) return;
    const list = this.selected.type === "pin" ? zone.pins : zone.strokes;
    list.splice(list.indexOf(feature), 1);
    this.select(null);
    this.editor.save(zone);
  }

  // --- tools ---

  tool(zone, name) {
    if (PINS[name]) return this.pinTool(zone, name);
    if (STROKES[name]) return this.strokeTool(zone, name);
    return this.selectTool(zone);
  }

  // A spot inside the zone, snapped to the cell grid, or null (with a message) outside it.
  place(tile, zone) {
    const point = snapToCell(tile);
    if (this.editor.inRegion(point, zone)) return point;
    this.editor.say("Features go inside the zone's region.");
    return null;
  }

  pinTool(zone, kind) {
    return {
      down: (tile) => {
        const existing = this.pinAt(zone, tile);
        if (existing) return this.grabPin(existing);
        this.addPin(zone, kind, tile);
        return true;
      },
      move: (tile) => this.dragTo(tile, zone),
      up: () => this.endDrag(zone),
    };
  }

  addPin(zone, kind, tile) {
    const at = this.place(tile, zone);
    if (!at) return;
    const pin = { id: nextId(zone, "p"), kind, at };
    if (kind === "height") pin.height = DEFAULT_HEIGHT_FT;
    if (kind === "biome") pin.biome = DEFAULT_BIOME_PIN;
    zone.pins.push(pin);
    this.select("pin", pin.id);
    this.editor.save(zone);
  }

  strokeTool(zone, kind) {
    return {
      down: (tile) => {
        const pts = this.stroke?.points ?? [];
        if (pts.length >= 2 && this.editor.nearScreen(pts[pts.length - 1], tile)) {
          this.finishStroke(zone);
          return true;
        }
        const point = this.place(tile, zone);
        if (!point) return true;
        if (!this.stroke) this.stroke = { kind, points: [] };
        this.stroke.points.push(point);
        this.editor.say();
        return true;
      },
    };
  }

  finishStroke(zone) {
    const { kind, points } = this.stroke ?? {};
    this.stroke = null;
    if (!points || points.length < 2) return;
    const stroke = { id: nextId(zone, "s"), kind, points, width: STROKES[kind].width };
    zone.strokes.push(stroke);
    this.select("stroke", stroke.id);
    this.editor.save(zone);
  }

  selectTool(zone) {
    return {
      down: (tile, e) => {
        const stroke = this.selected?.type === "stroke" ? this.find(zone) : null;
        if (stroke) {
          const grabbed = this.grabStrokePoint(zone, stroke, tile, e);
          if (grabbed !== null) return grabbed;
        }
        const pin = this.pinAt(zone, tile);
        if (pin) return this.grabPin(pin);
        const hit = this.strokeAt(zone, tile);
        this.select(hit ? "stroke" : null, hit?.id);
        return Boolean(hit);
      },
      move: (tile) => this.dragTo(tile, zone),
      up: () => this.endDrag(zone),
    };
  }

  endDrag(zone) {
    if (!this.dragging) return;
    this.dragging = null;
    this.editor.save(zone);
  }

  grabPin(pin) {
    this.select("pin", pin.id);
    this.dragging = { target: pin, key: "at" };
    return true;
  }

  // Starts dragging something picked in the 3D view: a pin, or one point of a stroke.
  grab(zone, { type, id, index }) {
    if (type === "pin") {
      const pin = zone.pins.find((p) => p.id === id);
      return pin ? this.grabPin(pin) : false;
    }
    const stroke = zone.strokes.find((s) => s.id === id);
    if (!stroke) return false;
    this.select("stroke", id);
    this.dragging = { target: stroke.points, key: index };
    return true;
  }

  // Lines of text about something picked in the 3D view, or null when it's gone.
  describe(zone, { type, id, index, ground }) {
    const feature = (type === "pin" ? zone.pins : zone.strokes).find((f) => f.id === id);
    if (!feature) return null;
    const kind = PINS[feature.kind] ?? STROKES[feature.kind];
    const lines = [`${kind.label} · ${feature.id} · ${zone.name || zone.key}`];
    if (feature.name) lines.push(feature.name);
    if (feature.kind === "biome") lines.push(`biome: ${feature.biome}`);
    const groundText = Number.isNaN(ground) ? "" : `ground ${Math.round(ground)}ft`;
    const heights = [feature.kind === "height" && `height ${feature.height ?? "?"}ft`, groundText].filter(Boolean);
    if (heights.length) lines.push(heights.join(" · "));
    if (type === "stroke") lines.push(`point ${index + 1} of ${feature.points.length} · width ${feature.width}ft`);
    if (feature.tags?.length) lines.push(`tags: ${feature.tags.join(", ")}`);
    if (feature.notes) lines.push(feature.notes);
    return lines;
  }

  // Returns true when the press took a point of the selected stroke, false when it was used up
  // without a drag, and null when it missed.
  grabStrokePoint(zone, stroke, tile, e) {
    const index = stroke.points.findIndex((p) => this.editor.nearScreen(p, tile));
    if (index >= 0 && e.altKey) {
      stroke.points.splice(index, 1);
      if (stroke.points.length < 2) this.remove(zone);
      else this.editor.save(zone);
      return true;
    }
    if (index >= 0) {
      this.dragging = { target: stroke.points, key: index };
      return true;
    }
    if (e.shiftKey) {
      const near = nearestOnStroke(stroke.points, tile);
      if (near.dist * this.map.view.scale > 8 * this.map.dpr) return null;
      const point = this.place(tile, zone);
      if (!point) return true;
      stroke.points.splice(near.index + 1, 0, point);
      this.dragging = { target: stroke.points, key: near.index + 1 };
      return true;
    }
    return null;
  }

  dragTo(tile, zone) {
    if (!this.dragging) return;
    const point = snapToCell(tile);
    if (!this.editor.inRegion(point, zone)) return;
    this.dragging.target[this.dragging.key] = point;
  }

  pinAt(zone, tile) {
    return [...zone.pins].reverse().find((p) => this.editor.nearScreen(p.at, tile)) ?? null;
  }

  strokeAt(zone, tile) {
    return (
      [...zone.strokes].reverse().find((s) => {
        const reachFt = Math.max(s.width / 2, 0);
        const reach = Math.max(8 * this.map.dpr, (reachFt / TILE_FT) * this.map.view.scale);
        return nearestOnStroke(s.points, tile).dist * this.map.view.scale < reach;
      }) ?? null
    );
  }

  onKey(e, zone) {
    if (this.stroke) {
      if (e.key === "Enter") this.finishStroke(zone);
      if (e.key === "Escape") this.stroke = null;
      if (e.key === "Backspace") this.stroke.points.pop();
      return true;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && this.selected) {
      this.remove(zone);
      return true;
    }
    return false;
  }

  // --- drawing ---

  draw(ctx, zone, active) {
    ctx.globalAlpha = active ? 1 : 0.45;
    for (const stroke of zone.strokes) {
      this.drawStroke(ctx, stroke, active && this.selected?.id === stroke.id);
    }
    for (const pin of zone.pins) this.drawPin(ctx, pin, active && this.selected?.id === pin.id);
    ctx.globalAlpha = 1;
  }

  drawInProgress(ctx) {
    if (!this.stroke) return;
    const points = [...this.stroke.points];
    if (this.map.pointer) points.push(snapToCell(this.map.pointer));
    this.drawStroke(ctx, { kind: this.stroke.kind, points, width: STROKES[this.stroke.kind].width }, true);
  }

  drawStroke(ctx, stroke, highlight) {
    const kind = STROKES[stroke.kind];
    const dpr = this.map.dpr;
    const pts = stroke.points.map((p) => this.map.toScreen(p));
    if (pts.length === 0) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = kind.color;
    ctx.lineWidth = Math.max(2 * dpr, (stroke.width / TILE_FT) * this.map.view.scale);
    polyline(ctx, pts);
    if (stroke.kind === "river" && pts.length > 1) arrow(ctx, pts[pts.length - 2], pts[pts.length - 1], kind.color, dpr);

    if (highlight) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = dpr;
      polyline(ctx, pts);
      ctx.fillStyle = "#fff";
      for (const [x, y] of pts) ctx.fillRect(x - 3 * dpr, y - 3 * dpr, 6 * dpr, 6 * dpr);
    }
  }

  drawPin(ctx, pin, highlight) {
    const dpr = this.map.dpr;
    const [x, y] = this.map.toScreen(pin.at);
    const r = 7 * dpr;
    ctx.fillStyle = PINS[pin.kind].color;
    ctx.strokeStyle = highlight ? "#fff" : "#000";
    ctx.lineWidth = (highlight ? 2 : 1) * dpr;
    ctx.beginPath();
    if (pin.kind === "biome") {
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
          : pin.name || (pin.tags ?? []).join(", ");
    if (label) {
      ctx.fillStyle = "#eee";
      ctx.font = `${12 * dpr}px ui-monospace, monospace`;
      ctx.fillText(label, x + r + 3 * dpr, y + 4 * dpr);
    }
  }

  // --- properties panel ---

  renderProps(box, zone) {
    box.innerHTML = "";
    const feature = zone && this.find(zone);
    if (!feature) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const kind = PINS[feature.kind] ?? STROKES[feature.kind];
    const heading = document.createElement("h2");
    heading.textContent = `${kind.label} · ${feature.id}`;
    box.append(heading);

    const fields = ["name"];
    if (feature.kind === "height") fields.push("height");
    if (feature.kind === "biome") fields.push("biome");
    if (STROKES[feature.kind]) fields.push("width");
    fields.push("tags", "notes");
    for (const key of fields) box.append(this.field(zone, feature, key));

    const row = document.createElement("div");
    row.className = "editor-row";
    row.append(button(`delete ${kind.label}`, () => this.remove(zone)));
    box.append(row);
  }

  field(zone, feature, key) {
    const label = document.createElement("label");
    label.className = "editor-field";
    label.textContent = { height: "height (ft)", width: "width (ft)", tags: "tags (comma-separated)" }[key] ?? key;
    const numeric = key === "height" || key === "width";
    const input = document.createElement(key === "notes" ? "textarea" : key === "biome" ? "select" : "input");
    if (key === "notes") input.rows = 4;
    else if (key === "biome") for (const biome of BIOMES) input.add(new Option(biome, biome));
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
      this.editor.save(zone);
    });
    label.append(input);
    return label;
  }
}

// The segment of a stroke nearest a point: the index of its first point, and the distance.
export function nearestOnStroke(points, [x, z]) {
  let best = { index: -1, dist: Infinity };
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const dist = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
    if (dist < best.dist) best = { index: i - 1, dist };
  }
  return best;
}

function polyline(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

function arrow(ctx, [ax, ay], [bx, by], color, dpr) {
  const angle = Math.atan2(by - ay, bx - ax);
  const size = 12 * dpr;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - size * Math.cos(angle - 0.4), by - size * Math.sin(angle - 0.4));
  ctx.lineTo(bx - size * Math.cos(angle + 0.4), by - size * Math.sin(angle + 0.4));
  ctx.fill();
}

function button(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
