import { PICK_PX } from "./areas.js";

// The tools that draw areas (areas.js): geo's biomes (biomes.js), water (water.js), roads
// (roads.js) and courses (courses.js), units' resting and spawn areas (continentAreas.js). Clicking corners
// draws an area, closed by clicking its first corner, double-clicking or Enter, and Esc throws it
// away. Roads and courses are open lines, courses from their source down. Clicking an area or its
// outline picks it out; then its corners drag, shift-clicking one takes it away, dragging an edge
// adds one, clicking inside it starts another area there, and clicking outside puts it back.
// Water's level, a road's width and a course's widths can be typed for the one picked out.

const $ = (id) => document.getElementById(id);
const tenths = (v) => Math.round(v * 10) / 10;

// Fills an input from the area picked out, but while it's being typed.
function show(input, selected, value) {
  input.disabled = !selected;
  if (document.activeElement !== input) input.value = selected ? String(value(selected)) : "";
}

// Each tool's kind buttons' data attribute, delete and undo buttons, and inputs for the area
// picked out: bind(areas) once, and sync(areas) to show it.
const PANELS = {
  biomes: { kind: "biome", del: "biomesDelete", undo: "biomesUndo" },
  water: {
    kind: "water",
    del: "waterDelete",
    undo: "waterUndo",
    bind: (water) =>
      $("waterLevel").addEventListener("change", () => {
        const level = Number($("waterLevel").value);
        if (Number.isFinite(level)) water.setExtra("level", tenths(level));
      }),
    sync: (water) => show($("waterLevel"), water.selected, (area) => area.level),
  },
  roads: {
    kind: "road",
    del: "roadsDelete",
    undo: "roadsUndo",
    bind: (roads) =>
      $("roadWidth").addEventListener("change", () => {
        const width = Number($("roadWidth").value);
        if (width > 0) roads.setWidth(tenths(width));
      }),
    sync: (roads) => show($("roadWidth"), roads.selected, (area) => area.width),
  },
  courses: {
    kind: "course",
    del: "coursesDelete",
    undo: "coursesUndo",
    bind: (courses) => {
      for (const id of ["courseStart", "courseEnd"]) {
        $(id).addEventListener("change", () => {
          const [start, end] = [Number($("courseStart").value), Number($("courseEnd").value)];
          if (start > 0 && end > 0) courses.setWidths(tenths(start), tenths(end));
        });
      }
      $("courseRipple").addEventListener("change", () => courses.setRipple($("courseRipple").checked));
    },
    sync: (courses) => {
      ["courseStart", "courseEnd"].forEach((id, k) => show($(id), courses.selected, (area) => area.widths[k]));
      $("courseRipple").checked = courses.ripple;
    },
  },
  restArea: { del: "restAreaDelete", undo: "restAreaUndo" },
  spawnArea: { del: "spawnAreaDelete", undo: "spawnAreaUndo", sync: (areas) => areas.onSync?.(areas.selected) },
};

export class AreaTool {
  // tool: which of PANELS. areas: the Areas it draws.
  constructor(tools, tool, areas) {
    this.tools = tools;
    this.areas = areas;
    this.panel = PANELS[tool];
    const { kind, del, undo, bind } = this.panel;
    this.kindButtons = kind ? [...document.querySelectorAll(`[data-${kind}]`)] : [];
    for (const button of this.kindButtons) {
      button.addEventListener("click", () => {
        areas.setKind(button.dataset[kind]);
        this.showKind(button.dataset[kind]);
      });
    }
    $(del).addEventListener("click", () => areas.deleteSelected());
    $(undo).addEventListener("click", () => areas.undo());
    bind?.(areas);
  }

  setTool(tool) {
    if (tool) this.panel.sync?.(this.areas);
    else this.areas.letGo();
  }

  // A click: a corner for the area being drawn, or closing it at its first corner; or a picked
  // out area's corner or edge to drag; or an area to pick out; or the first corner of a new one.
  down(e) {
    const { areas, tools } = this;
    const { camera } = tools;
    const r = tools.canvas.getBoundingClientRect();
    const [px, py] = [e.clientX - r.left, e.clientY - r.top];
    const near = (p) => {
      const s = p && areas.screen(camera, r.width, r.height, p);
      return s && Math.hypot(s[0] - px, s[1] - py) <= PICK_PX;
    };
    const at = tools.hit();
    const { draft } = areas;
    if (draft) {
      if (areas.closed && draft.points.length >= 3 && near(draft.points[0])) return areas.close();
      // A double-click's second press, closed by the dblclick.
      if (near(draft.points.at(-1))) return;
      if (at) areas.addCorner(at[0], at[2]);
      return;
    }
    const picked = areas.pick(camera, r.width, r.height, px, py);
    if (picked?.corner !== undefined) {
      if (e.shiftKey) areas.removeCorner(picked.corner);
      else areas.grab(picked.corner);
      return;
    }
    if (picked && at) return areas.split(picked.edge, at[0], at[2]);
    const outlined = areas.pickArea(camera, r.width, r.height, px, py);
    if (outlined) return this.select(outlined);
    if (!at) return;
    const area = areas.at(at[0], at[2]);
    if (area && area !== areas.selected) return this.select(area);
    // Clicking away from the area picked out only puts it back.
    if (!area && areas.selected) return areas.unselect();
    areas.addCorner(at[0], at[2]);
  }

  move() {
    if (!this.areas.dragging) return;
    const at = this.tools.hit();
    if (at) this.areas.drag(at[0], at[2]);
  }

  up() {
    this.areas.letGo();
  }

  dblclick() {
    this.areas.close();
  }

  key(e) {
    const { areas } = this;
    if (e.key === "Escape" && areas.draft) areas.drop();
    else if (e.key === "Enter") areas.close();
    else if (e.key === "Delete" || e.key === "Backspace") {
      if (areas.draft) areas.backCorner();
      else areas.deleteSelected();
    } else return false;
    return true;
  }

  tick() {
    this.panel.sync?.(this.areas);
  }

  select(area) {
    this.areas.select(area);
    this.areas.kind = area.kind;
    this.showKind(area.kind);
  }

  showKind(kind) {
    this.kindButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[this.panel.kind] === kind)));
  }
}
