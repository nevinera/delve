import { snapToCell } from "./region.js";
import { TILE_FT } from "../world/constants.js";

// The continent's sketch (zones.js loadSketch): pins ({ id, kind, at, ... }) and strokes ({ id,
// kind, points, width, ... }) anywhere on its land, in continent tile units with sizes in feet. Height pins set the ground height at a spot;
// biome pins claim the land around them for a biome, adjusted by their tags; info pins carry a
// name, notes and tags for people and LLMs and don't affect generation. Rivers flow the way
// they're drawn. Roads and hubs don't shape the ground yet. There are no coastlines: the sea is
// wherever no zone is.

export const PINS = {
  height: { color: "#70d070", label: "height pin" },
  biome: { color: "#e0a040", label: "biome pin" },
  hub: { color: "#e05a5a", label: "hub" },
  info: { color: "#b08ae0", label: "info pin" },
};
export const STROKES = {
  river: { color: "#4a90d9", width: 30, label: "river" },
  road: { color: "#c8a26a", width: 16, label: "road" },
};
export const FEATURE_HINTS = {
  select: "click a pin or line to select it · drag pins and line points · shift-click a selected line to add a point · alt-click a point to remove it · delete removes the selection",
  pin: "click on land to place · click a pin to select or drag it",
  stroke: "click on land to add points · click the last point or press enter to finish · backspace removes the last · esc cancels · right-drag to pan",
};

const DEFAULT_HEIGHT_FT = 20;
const DEFAULT_HUB_RADIUS_FT = 200;
const SHAPE_PINS = ["height", "biome"];

export function nextId(sketch, prefix) {
  const used = new Set([...sketch.pins, ...sketch.strokes].map((f) => f.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

// Tools, drawing and the properties panel for the sketch's features. The editor keeps the sketch
// (editor.sketch) and stores it (editor.saveSketch).
export class Features {
  constructor(editor) {
    this.editor = editor;
    this.selected = null; // { type: "pin" | "stroke", id }
    this.kinds = []; // what the current tool can pick
    this.stroke = null; // a stroke being drawn: { kind, points }
  }

  get map() {
    return this.editor.map;
  }

  // The selected feature.
  find(sketch) {
    if (!this.selected) return null;
    const list = this.selected.type === "pin" ? sketch.pins : sketch.strokes;
    return list.find((f) => f.id === this.selected.id) ?? null;
  }

  select(sketch, type, id) {
    this.selected = sketch && type ? { type, id } : null;
    this.editor.renderProps();
  }

  isSelected(sketch, feature) {
    return this.selected?.id === feature.id;
  }

  remove(sketch) {
    const feature = this.find(sketch);
    if (!feature) return;
    const list = this.selected.type === "pin" ? sketch.pins : sketch.strokes;
    list.splice(list.indexOf(feature), 1);
    this.select(null);
    this.editor.saveSketch();
  }

  // --- tools ---

  // `kinds` limits what the select tool picks, and what a pin tool's click can grab.
  tool(sketch, name, kinds) {
    this.kinds = kinds ?? [...Object.keys(PINS), ...Object.keys(STROKES)];
    if (PINS[name]) return this.pinTool(sketch, name);
    if (STROKES[name]) return this.strokeTool(sketch, name);
    return this.selectTool(sketch);
  }

  // A spot for a feature of `kind`, snapped to the cell grid: on land, or anywhere for a river,
  // which may run out to sea. Null (with a message) for a spot it can't go.
  place(tile, kind) {
    const point = snapToCell(tile);
    if (kind === "river" || this.editor.onLand(point)) return point;
    this.editor.say("Features go on land, inside some zone.");
    return null;
  }

  pinTool(sketch, kind) {
    return {
      down: (tile) => {
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
    const at = this.place(tile, kind);
    if (!at) return;
    const pin = { id: nextId(sketch, "p"), kind, at, ...props };
    if (kind === "height") pin.height ??= DEFAULT_HEIGHT_FT;
    if (kind === "hub") pin.radius ??= DEFAULT_HUB_RADIUS_FT;
    sketch.pins.push(pin);
    this.select(sketch, SHAPE_PINS.includes(kind) ? null : "pin", pin.id);
    this.editor.saveSketch();
  }

  strokeTool(sketch, kind) {
    return {
      down: (tile) => {
        const pts = this.stroke?.points ?? [];
        if (pts.length >= 2 && this.editor.nearScreen(pts[pts.length - 1], tile)) {
          this.finishStroke(sketch);
          return true;
        }
        const point = this.place(tile, kind);
        if (!point) return true;
        if (!this.stroke) this.stroke = { kind, points: [] };
        this.stroke.points.push(point);
        this.editor.say();
        return true;
      },
    };
  }

  finishStroke(sketch) {
    const { kind, points } = this.stroke ?? {};
    this.stroke = null;
    if (!points || points.length < 2) return;
    const stroke = { id: nextId(sketch, "s"), kind, points, width: STROKES[kind].width };
    sketch.strokes.push(stroke);
    this.select(sketch, "stroke", stroke.id);
    this.editor.saveSketch();
  }

  selectTool(sketch) {
    return {
      down: (tile, e) => {
        const stroke = this.selected?.type === "stroke" ? this.find(sketch) : null;
        if (stroke) {
          const grabbed = this.grabStrokePoint(sketch, stroke, tile, e);
          if (grabbed !== null) return grabbed;
        }
        const pin = this.pinAt(sketch, tile);
        if (pin) return this.grabPin(sketch, pin);
        const hit = this.strokeAt(sketch, tile);
        this.select(sketch, hit ? "stroke" : null, hit?.id);
        return Boolean(hit);
      },
      move: (tile) => this.dragTo(tile, sketch),
      up: () => this.endDrag(sketch),
    };
  }

  endDrag(sketch) {
    if (!this.dragging) return;
    this.dragging = null;
    this.editor.saveSketch();
  }

  grabPin(sketch, pin) {
    this.select(sketch, "pin", pin.id);
    this.dragging = { target: pin, key: "at", kind: pin.kind };
    return true;
  }

  // Returns true when the press took a point of the selected stroke, false when it was used up
  // without a drag, and null when it missed.
  grabStrokePoint(sketch, stroke, tile, e) {
    const index = stroke.points.findIndex((p) => this.editor.nearScreen(p, tile));
    if (index >= 0 && e.altKey) {
      stroke.points.splice(index, 1);
      if (stroke.points.length < 2) this.remove(sketch);
      else this.editor.saveSketch();
      return true;
    }
    if (index >= 0) {
      this.dragging = { target: stroke.points, key: index, kind: stroke.kind };
      return true;
    }
    if (e.shiftKey) {
      const near = nearestOnStroke(stroke.points, tile);
      if (near.dist * this.map.view.scale > 8 * this.map.dpr) return null;
      const point = this.place(tile, stroke.kind);
      if (!point) return true;
      stroke.points.splice(near.index + 1, 0, point);
      this.dragging = { target: stroke.points, key: near.index + 1, kind: stroke.kind };
      return true;
    }
    return null;
  }

  dragTo(tile, sketch) {
    if (!this.dragging) return;
    const point = snapToCell(tile);
    if (this.dragging.kind !== "river" && !this.editor.onLand(point)) return;
    this.dragging.target[this.dragging.key] = point;
  }

  pinAt(sketch, tile) {
    return [...sketch.pins].reverse().find((p) => this.kinds.includes(p.kind) && this.editor.nearScreen(p.at, tile)) ?? null;
  }

  strokeAt(sketch, tile) {
    return (
      [...sketch.strokes].reverse().find((s) => {
        if (!this.kinds.includes(s.kind)) return false;
        const reachFt = Math.max(s.width / 2, 0);
        const reach = Math.max(8 * this.map.dpr, (reachFt / TILE_FT) * this.map.view.scale);
        return nearestOnStroke(s.points, tile).dist * this.map.view.scale < reach;
      }) ?? null
    );
  }

  onKey(e, sketch) {
    if (this.stroke) {
      if (e.key === "Enter") this.finishStroke(sketch);
      if (e.key === "Escape") this.stroke = null;
      if (e.key === "Backspace") this.stroke.points.pop();
      return true;
    }
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

  // Draws the sketch's features of the given kinds, and its strokes of `lines` kinds as plain
  // reference lines. `flow` (rivers.js riverFlow) points each river segment's arrow downstream.
  draw(ctx, sketch, { kinds, lines = [], flow = null }) {
    for (const stroke of sketch.strokes) {
      if (kinds.includes(stroke.kind)) this.drawStroke(ctx, stroke, this.isSelected(sketch, stroke), flow?.get(stroke.id));
      else if (lines.includes(stroke.kind)) this.drawLine(ctx, stroke);
    }
    for (const pin of sketch.pins) {
      if (kinds.includes(pin.kind)) this.drawPin(ctx, pin, this.isSelected(sketch, pin));
    }
  }

  drawLine(ctx, stroke) {
    ctx.strokeStyle = STROKES[stroke.kind].color;
    ctx.lineWidth = 2 * this.map.dpr;
    polyline(ctx, stroke.points.map((p) => this.map.toScreen(p)));
  }

  drawInProgress(ctx) {
    if (!this.stroke) return;
    const points = [...this.stroke.points];
    if (this.map.pointer) points.push(snapToCell(this.map.pointer));
    this.drawStroke(ctx, { kind: this.stroke.kind, points, width: STROKES[this.stroke.kind].width }, true);
  }

  // `forward`: for a river, one boolean per segment, true where it flows the way it was drawn.
  drawStroke(ctx, stroke, highlight, forward) {
    const kind = STROKES[stroke.kind];
    const dpr = this.map.dpr;
    const pts = stroke.points.map((p) => this.map.toScreen(p));
    if (pts.length === 0) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = kind.color;
    ctx.lineWidth = Math.max(2 * dpr, (stroke.width / TILE_FT) * this.map.view.scale);
    polyline(ctx, pts);
    if (stroke.kind === "river") {
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = forward?.[i - 1] === false ? [pts[i], pts[i - 1]] : [pts[i - 1], pts[i]];
        arrow(ctx, a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], "#fff", dpr);
      }
    }

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

  renderProps(box, sketch) {
    box.innerHTML = "";
    const feature = sketch && this.find(sketch);
    if (!feature) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const kind = PINS[feature.kind] ?? STROKES[feature.kind];
    const heading = document.createElement("h2");
    heading.textContent = `${kind.label} · ${feature.id}`;
    box.append(heading);

    // Height and biome settings live in the shape palette.
    const fields = ["name"];
    if (STROKES[feature.kind]) fields.push("width");
    if (feature.kind === "hub") fields.push("radius");
    if (!SHAPE_PINS.includes(feature.kind)) fields.push("tags");
    fields.push("notes");
    for (const key of fields) box.append(this.field(sketch, feature, key));

    const row = document.createElement("div");
    row.className = "editor-row";
    row.append(button(`delete ${kind.label}`, () => this.remove(sketch)));
    box.append(row);
  }

  field(sketch, feature, key) {
    const label = document.createElement("label");
    label.className = "editor-field";
    label.textContent = { width: "width (ft)", radius: "radius (ft)", tags: "tags (comma-separated)" }[key] ?? key;
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

// An arrowhead at (bx, by), pointing away from (ax, ay), with a dark rim so it shows on any map.
function arrow(ctx, [ax, ay], [bx, by], color, dpr) {
  const angle = Math.atan2(by - ay, bx - ax);
  const size = 10 * dpr;
  const [tx, ty] = [bx + (size / 2) * Math.cos(angle), by + (size / 2) * Math.sin(angle)];
  ctx.fillStyle = color;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - size * Math.cos(angle - 0.45), ty - size * Math.sin(angle - 0.45));
  ctx.lineTo(tx - size * Math.cos(angle + 0.45), ty - size * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function button(text, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
