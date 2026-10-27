import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MAX_PARAMS, addColor } from "../world/builtObjects.js";
import { CELL_FT, FOUNDATIONS, LEVELS, REACH_CELLS, STOREY_FT, WALL_FT, cellKey, edgeKey, parseCell, problems, withWalk } from "../world/structures.js";
import { disposeStructureGroup, structureGroup } from "./structureMeshes.js";

// The structure builder: a dialog over most of the page for laying out a structure
// (world/structures.js) on its grid, storey by storey. Pick a storey, then draw on its grid: floor
// fills the rectangle of cells you drag across; wall, door and window set the edges along a
// straight line from where you start, across or down the grid, whichever way you drag further.
// Holding shift erases. The storeys above the one you're on fade. The panel sets the
// storey height, the materials (each a palette color and a wall thickness), what floors and the
// foundation are made of, and how tall doors and windows are.
//
// Opened read-only, it shows the structure and offers to copy it into one of the world's own
// collections. Saving bakes its walk data and hands it to onSave.
//
// Right-drag turns the view, middle-drag pans and the wheel zooms, as in the object builder.

const UNDO_KEEP = 100;
const TOOLS = ["floor", "wall", "door", "window"];
const KEYS = { 1: "floor", 2: "wall", 3: "door", 4: "window" };
const OPENING_START = { door: { sill: 0, top: 8 }, window: { sill: 3, top: 6 } };
const FADED = 0.15; // how much of the storeys above the current one shows
const NEW_MATERIAL = { color: "#a0a0a0", thicknessFt: 1 };
const COLORS = { grid: 0x626a58, gridMajor: 0x9aa48c, ground: 0x4a5040, background: 0x20242a, hover: 0xffe066, erase: 0xff6060 };
const HINT = "1 floor, 2 wall, 3 door, 4 window · drag to draw, shift-drag erases · page up and down change storey · F frames it · right-drag turns the view · middle-drag pans · wheel zooms · ctrl-z undoes, ctrl-shift-z redoes";

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

export class StructureBuilder {
  // onSave(structure) hears the structure when it's saved, onSaveCopy(structure) when it's saved
  // as a copy instead, and onDelete(structure) when deleting it is asked for.
  constructor({ onSave, onSaveCopy, onDelete }) {
    Object.assign(this, { onSave, onSaveCopy, onDelete });
    this.structure = null;
    this.level = 0;
    this.tool = "wall";
    this.material = "stone";
    this.openings = structuredClone(OPENING_START);
    this.undos = [];
    this.redos = [];
    this.buildDom();
  }

  get isOpen() {
    return this.dialog.open;
  }

  // Opens the builder on a copy of `structure`. collections: the world's own, [{ id, name }].
  // readOnly: look, don't touch; onCopy(structure, collectionId) hears a copy asked for.
  open(structure, { collections = [], readOnly = false, onCopy } = {}) {
    this.readOnly = readOnly;
    this.onCopy = onCopy;
    for (const select of [this.collection, this.copyTo]) select.replaceChildren(...collections.map((c) => new Option(c.name, c.id)));
    this.dialog.classList.toggle("ob-readonly", readOnly);
    for (const node of [this.details, this.settings]) node.inert = readOnly;
    this.structure = structuredClone(structure);
    this.saved = JSON.stringify(this.structure);
    this.undos = [];
    this.redos = [];
    this.level = this.structure.storeys.some((s) => s.level === 0) ? 0 : this.structure.storeys[0].level;
    if (!this.structure.materials[this.material]) this.material = Object.keys(this.structure.materials)[0];
    this.dialog.showModal();
    this.setupView();
    this.resize();
    this.frame();
    this.refresh();
    this.start();
  }

  close() {
    this.dialog.close();
  }

  // --- the dialog ---

  buildDom() {
    const div = (cls, ...c) => el("div", { className: cls }, ...c);
    const field = (label, input) => el("label", { className: "ob-field" }, label, input);
    const button = (label, onclick, title = "") => el("button", { type: "button", textContent: label, title, onclick });
    this.canvas = el("canvas", { className: "ob-canvas", tabIndex: -1 });
    this.name = el("input", { type: "text", placeholder: "name" });
    this.name.addEventListener("change", () => this.change((s) => (s.name = this.name.value.trim() || "unnamed")));
    this.tags = el("input", { type: "text", placeholder: "tags, by commas" });
    this.tags.addEventListener("change", () =>
      this.change((s) => {
        const tags = this.tags.value.split(",").map((t) => t.trim()).filter(Boolean);
        if (tags.length) s.tags = tags;
        else delete s.tags;
      }),
    );
    this.collection = el("select", { title: "the collection it's in", onchange: () => this.change((s) => (s.collection = this.collection.value)) });
    this.details = div("ob-details", this.name, this.tags, field("collection", this.collection));

    this.levels = div("ob-row sb-levels");
    this.storeyFt = el("input", { type: "number", min: STOREY_FT.least, max: STOREY_FT.most, step: 1, title: "floor to floor, in feet" });
    this.storeyFt.addEventListener("change", () => this.change((s) => (s.storeyFt = Math.max(STOREY_FT.least, Math.min(STOREY_FT.most, Math.round(Number(this.storeyFt.value)) || STOREY_FT.start)))));
    const storeys = div(
      "ob-row",
      button("+ above", () => this.addStorey(1), "a new storey over the top one"),
      button("+ below", () => this.addStorey(-1), "a new storey under the bottom one, dug into the ground"),
      button("remove", () => this.removeStorey(), "take away the storey you're on"),
      el("span", { textContent: "height" }),
      this.storeyFt,
      el("span", { textContent: "ft" }),
    );

    this.toolButtons = TOOLS.map((tool, i) => button(tool, () => this.setTool(tool), `${i + 1}`));
    this.wallMaterial = el("select", { title: "what new walls are made of", onchange: () => (this.material = this.wallMaterial.value) });
    const opening = (kind, part) => {
      const input = el("input", { type: "number", min: 0, step: 0.5, title: `${kind} ${part === "sill" ? "sill" : "top"}, feet above the floor` });
      input.addEventListener("change", () => (this.openings[kind][part] = Math.max(0, Number(input.value) || 0)));
      return input;
    };
    this.openingInputs = { door: { top: opening("door", "top") }, window: { sill: opening("window", "sill"), top: opening("window", "top") } };
    const draw = div(
      "ob-row",
      ...this.toolButtons,
      field("walls of", this.wallMaterial),
      el("span", { textContent: "door to" }),
      this.openingInputs.door.top,
      el("span", { textContent: "ft · window" }),
      this.openingInputs.window.sill,
      el("span", { textContent: "to" }),
      this.openingInputs.window.top,
      el("span", { textContent: "ft" }),
    );

    this.materials = div("ob-palette");
    this.floorMaterial = el("select", { onchange: () => this.change((s) => (s.floor = this.floorMaterial.value)) });
    this.foundationKind = el("select", { onchange: () => this.change((s) => (s.foundation.kind = this.foundationKind.value)) });
    for (const kind of FOUNDATIONS) this.foundationKind.add(new Option(kind, kind));
    this.foundationMaterial = el("select", { onchange: () => this.change((s) => (s.foundation.material = this.foundationMaterial.value)) });
    this.settings = div(
      "sb-settings",
      el("h3", { textContent: "storeys" }),
      this.levels,
      storeys,
      el("h3", { textContent: "draw" }),
      draw,
      el("h3", { textContent: "materials" }),
      this.materials,
      button("+ material", () => this.addMaterial()),
      div("ob-row", field("floors of", this.floorMaterial), field("foundation", this.foundationKind), field("of", this.foundationMaterial)),
    );

    this.info = el("p", { className: "ob-info" });
    this.problems = el("p", { className: "ob-problems" });
    this.saveButton = button("save", () => this.save());
    this.saveButton.classList.add("ob-edit");
    this.copyTo = el("select", { title: "your collection to copy it into" });
    const edit = (label, onclick, title) => Object.assign(button(label, onclick, title), { className: "ob-edit" });
    const view = (node) => (node.classList.add("ob-view-only"), node);
    const footer = div(
      "ob-row ob-footer",
      edit("undo", () => this.undo()),
      edit("redo", () => this.redo()),
      view(el("span", { textContent: "read-only · copy into" })),
      view(el("span", {}, this.copyTo)),
      view(button("copy", () => this.onCopy?.(structuredClone(this.structure), this.copyTo.value))),
      el("span", { className: "ob-spacer" }),
      edit("delete", () => this.onDelete?.(this.structure), "delete this structure from the world"),
      edit("save as copy", () => this.saveCopy(), "save this as a new structure, leaving the original as it was last saved"),
      view(button("close", () => this.close())),
      edit("cancel", () => this.cancel()),
      this.saveButton,
    );
    const panel = div("ob-panel", this.details, this.settings, this.info, this.problems, footer);
    this.dialog = el("dialog", { className: "ob sb" }, div("ob-main", div("ob-view", this.canvas, el("p", { className: "ob-hint", textContent: HINT })), panel));
    document.body.append(this.dialog);
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.cancel();
    });
    this.dialog.addEventListener("keydown", (e) => {
      e.stopPropagation();
      this.onKey(e);
    });
    window.addEventListener("resize", () => this.isOpen && this.resize());
  }

  onKey(e) {
    if (e.target.matches("input, select, textarea")) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (!ctrl && key === "f") this.frame();
    else if (e.key === "PageUp" || e.key === "PageDown") this.stepLevel(e.key === "PageUp" ? 1 : -1);
    else if (this.readOnly) return;
    else if (ctrl && key === "z") e.shiftKey ? this.redo() : this.undo();
    else if (!ctrl && KEYS[key]) this.setTool(KEYS[key]);
    else return;
    e.preventDefault();
  }

  // --- changes ---

  change(fn) {
    if (this.readOnly) return;
    const before = JSON.stringify(this.structure);
    fn(this.structure);
    if (JSON.stringify(this.structure) !== before) {
      this.undos.push(before);
      if (this.undos.length > UNDO_KEEP) this.undos.shift();
      this.redos = [];
    }
    this.refresh();
  }

  undo() {
    this.replay(this.undos, this.redos);
  }

  redo() {
    this.replay(this.redos, this.undos);
  }

  replay(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(this.structure));
    this.structure = JSON.parse(from.pop());
    if (!this.storey()) this.level = this.structure.storeys[0].level;
    this.refresh();
  }

  storey(level = this.level) {
    return this.structure.storeys.find((s) => s.level === level);
  }

  setTool(tool) {
    this.tool = tool;
    this.refreshPanel();
  }

  stepLevel(by) {
    const levels = this.structure.storeys.map((s) => s.level).sort((a, b) => a - b);
    const next = levels[levels.indexOf(this.level) + by];
    if (next === undefined) return;
    this.level = next;
    this.refresh();
  }

  addStorey(side) {
    const levels = this.structure.storeys.map((s) => s.level);
    const level = side > 0 ? Math.max(...levels) + 1 : Math.min(...levels) - 1;
    if (level < LEVELS.least || level > LEVELS.most) return;
    this.change((s) => s.storeys.push({ level, floor: [], edges: {} }));
    this.level = level;
    this.refresh();
  }

  removeStorey() {
    const storey = this.storey();
    if (this.structure.storeys.length < 2) return;
    const used = storey.floor.length || Object.keys(storey.edges).length || this.structure.components.some((c) => c.level === this.level);
    if (used && !window.confirm(`Take away storey ${this.level} and everything on it?`)) return;
    const level = this.level;
    this.change((s) => {
      s.storeys = s.storeys.filter((x) => x.level !== level);
      s.components = s.components.filter((c) => c.level !== level);
    });
    this.level = this.structure.storeys.reduce((best, s) => (Math.abs(s.level - level) < Math.abs(best - level) ? s.level : best), this.structure.storeys[0].level);
    this.refresh();
  }

  addMaterial() {
    const name = window.prompt("A name for the material (stone, plaster, logs...):");
    if (!name?.trim() || this.structure.materials[name.trim()]) return;
    this.change((s) => (s.materials[name.trim()] = { color: addColor(s, NEW_MATERIAL.color), thicknessFt: NEW_MATERIAL.thicknessFt }));
  }

  // The cells or edges a stroke from `start` to `end` covers: the rectangle of cells between them,
  // or the edges along a straight line from the start, across or down the grid.
  strokeKeys(start, end) {
    if (this.tool === "floor") {
      const [[ax, az], [bx, bz]] = [parseCell(start.cell), parseCell(end.cell)];
      const keys = [];
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let z = Math.min(az, bz); z <= Math.max(az, bz); z++) keys.push(cellKey(x, z));
      return keys;
    }
    const [dx, dz] = [end.px - start.px, end.pz - start.pz];
    if (Math.hypot(dx, dz) < 0.3) return [start.edge];
    const across = Math.abs(dx) >= Math.abs(dz);
    const [from, to] = across ? [start.px, end.px] : [start.pz, end.pz];
    const line = Math.round(across ? start.pz : start.px);
    const keys = [];
    for (let i = Math.floor(Math.min(from, to)); i <= Math.floor(Math.max(from, to)); i++) keys.push(across ? edgeKey(i, line, "n") : edgeKey(line, i, "w"));
    return keys;
  }

  // Redraws the stroke so far: the storey as it was when the stroke began, with the tool used on
  // everything from its start to `end`.
  drawStroke(end) {
    const keys = this.strokeKeys(this.stroke.start, end);
    const at = this.structure.storeys.findIndex((s) => s.level === this.level);
    this.structure.storeys[at] = JSON.parse(this.stroke.storey);
    for (const key of keys) this.apply(key, this.stroke.erase);
    this.showHover(keys, this.stroke.erase);
    this.refreshScene();
  }

  // Uses the tool on a cell or edge; `erase` takes away instead.
  apply(key, erase) {
    const storey = this.storey();
    if (this.tool === "floor") {
      const has = storey.floor.includes(key);
      if (erase && has) storey.floor = storey.floor.filter((k) => k !== key);
      else if (!erase && !has) storey.floor.push(key);
      return;
    }
    const edge = storey.edges[key];
    if (this.tool === "wall") {
      if (erase) delete storey.edges[key];
      else storey.edges[key] = { material: this.material, ...(edge?.faces ? { faces: edge.faces } : {}) };
    } else if (erase) {
      if (edge?.opening === this.tool) for (const k of ["opening", "sill", "top"]) delete edge[k];
    } else {
      const { sill, top } = this.openings[this.tool];
      const fit = Math.min(top, this.structure.storeyFt);
      storey.edges[key] = { ...(edge ?? { material: this.material }), opening: this.tool, sill: this.tool === "door" ? 0 : Math.min(sill, fit - 0.5), top: fit };
    }
  }

  save() {
    if (problems(this.structure).length) return;
    this.onSave?.(withWalk(this.structure));
    this.close();
  }

  saveCopy() {
    if (problems(this.structure).length) return;
    this.onSaveCopy?.(withWalk(this.structure));
  }

  cancel() {
    if (!this.readOnly && JSON.stringify(this.structure) !== this.saved && !window.confirm("Throw away the changes to this structure?")) return;
    this.close();
  }

  // --- the panel ---

  refresh() {
    this.refreshPanel();
    this.refreshScene();
  }

  refreshPanel() {
    const s = this.structure;
    this.name.value = s.name;
    this.tags.value = (s.tags ?? []).join(", ");
    this.collection.value = s.collection ?? "";
    this.storeyFt.value = s.storeyFt;
    const levels = s.storeys.map((x) => x.level).sort((a, b) => b - a);
    this.levels.replaceChildren(
      ...levels.map((level) => {
        const b = el("button", { type: "button", textContent: level === 0 ? "ground" : level > 0 ? `+${level}` : `${level}`, title: level < 0 ? "below ground" : "", onclick: () => ((this.level = level), this.refresh()) });
        b.classList.toggle("active", level === this.level);
        return b;
      }),
    );
    for (const b of this.toolButtons) b.classList.toggle("active", b.textContent === this.tool);
    const names = Object.keys(s.materials);
    const options = (select, value) => {
      select.replaceChildren(...names.map((n) => new Option(n, n)));
      select.value = value;
    };
    options(this.wallMaterial, this.material);
    options(this.floorMaterial, s.floor);
    options(this.foundationMaterial, s.foundation.material);
    this.foundationKind.value = s.foundation.kind;
    this.openingInputs.door.top.value = this.openings.door.top;
    this.openingInputs.window.sill.value = this.openings.window.sill;
    this.openingInputs.window.top.value = this.openings.window.top;

    let params = 0;
    this.materials.replaceChildren(
      ...Object.entries(s.materials).map(([name, m]) => {
        const p = s.palette[m.color];
        const color = el("input", { type: "color", value: p?.color ?? "#ff00ff", title: "its color, for everything made of it" });
        color.addEventListener("change", () => this.change((x) => (x.palette[m.color].color = color.value)));
        const param = el("input", { type: "checkbox", checked: Boolean(p?.param), title: "a parameter: each placement can recolor it" });
        param.disabled = !p?.param && s.palette.filter((q) => q.param).length >= MAX_PARAMS;
        param.addEventListener("change", () => this.change((x) => (x.palette[m.color].param = param.checked)));
        if (p?.param) params++;
        const thickness = el("input", { type: "number", min: WALL_FT.least, max: WALL_FT.most, step: 0.25, value: m.thicknessFt, title: "how thick its walls are (ft)" });
        thickness.addEventListener("change", () => this.change((x) => (x.materials[name].thicknessFt = Math.max(WALL_FT.least, Math.min(WALL_FT.most, Number(thickness.value) || 1)))));
        const used = s.storeys.some((x) => Object.values(x.edges).some((e) => e.material === name)) || s.floor === name || s.foundation.material === name;
        const remove = el("button", { type: "button", textContent: "×", title: used ? "it's in use" : "take it away", disabled: used, onclick: () => this.change((x) => delete x.materials[name]) });
        return el("div", { className: "sb-material" }, color, el("span", { textContent: name }), el("label", { className: "ob-check" }, param, el("span", { textContent: "param" })), thickness, el("span", { textContent: "ft" }), remove);
      }),
    );

    const cells = new Set(s.storeys.flatMap((x) => x.floor));
    const wrong = problems(s);
    this.info.textContent = `${s.storeys.length} storey${s.storeys.length === 1 ? "" : "s"} · ${cells.size} cells of floor · ${params} of ${MAX_PARAMS} colors are params`;
    this.problems.textContent = wrong.join(" · ");
    this.saveButton.disabled = wrong.length > 0;
  }

  // --- the view ---

  setupView() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.background);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x4a4030, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(30, 50, 20);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
    const reach = REACH_CELLS * CELL_FT;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(reach * 3, reach * 3).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: COLORS.ground, transparent: true, opacity: 0.9 }));
    this.ground.position.y = -0.02;
    this.scene.add(this.ground);
    this.grid = new THREE.Group();
    this.grid.add(gridLines(reach, CELL_FT, COLORS.grid), gridLines(reach, CELL_FT * 4, COLORS.gridMajor));
    this.scene.add(this.grid);
    this.hover = new THREE.Group();
    this.scene.add(this.hover);
    this.built = new THREE.Group();
    this.scene.add(this.built);

    this.orbit = new OrbitControls(this.camera, this.canvas);
    this.orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.orbit.screenSpacePanning = false;

    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.focus();
      const start = this.targetAt(e);
      if (e.button !== 0 || this.readOnly || !start) return;
      this.canvas.setPointerCapture(e.pointerId);
      this.stroke = { before: JSON.stringify(this.structure), storey: JSON.stringify(this.storey()), erase: e.shiftKey, start };
      this.drawStroke(start);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      const target = this.targetAt(e);
      if (!this.stroke) return this.showHover(target && [this.tool === "floor" ? target.cell : target.edge], e.shiftKey);
      if (target) this.drawStroke(target);
    });
    this.canvas.addEventListener("pointerup", () => {
      if (!this.stroke) return;
      if (JSON.stringify(this.structure) !== this.stroke.before) {
        this.undos.push(this.stroke.before);
        this.redos = [];
      }
      this.stroke = null;
      this.refresh();
    });
    this.canvas.addEventListener("pointerleave", () => this.showHover(null));
  }

  height() {
    return this.level * this.structure.storeyFt;
  }

  // The cell under the pointer on the current storey and the edge nearest it, with where it is in
  // cells: { cell, edge, px, pz }, or null off the grid.
  targetAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.height()), new THREE.Vector3());
    if (!hit) return null;
    const [px, pz] = [hit.x / CELL_FT, hit.z / CELL_FT];
    const [x, z] = [Math.floor(px), Math.floor(pz)];
    if (Math.abs(x + 0.5) >= REACH_CELLS || Math.abs(z + 0.5) >= REACH_CELLS) return null;
    // The nearer of the nearest grid line across x and across z.
    const [dx, dz] = [Math.abs(px - Math.round(px)), Math.abs(pz - Math.round(pz))];
    const edge = dx < dz ? edgeKey(Math.round(px), z, "w") : edgeKey(x, Math.round(pz), "n");
    return { cell: cellKey(x, z), edge, px, pz };
  }

  // Outlines cells (for the floor tool) or edges on the current storey, or nothing.
  showHover(keys, erase = false) {
    for (const child of [...this.hover.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.hover.remove(child);
    }
    if (!keys || this.readOnly) return;
    const y = this.height() + 0.05;
    const points = [];
    const segment = (ax, az, bx, bz) => points.push(new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz));
    for (const key of keys) {
      const [x, z, side] = key.split(",");
      const [ax, az] = [Number(x) * CELL_FT, Number(z) * CELL_FT];
      if (this.tool === "floor") {
        segment(ax, az, ax + CELL_FT, az);
        segment(ax + CELL_FT, az, ax + CELL_FT, az + CELL_FT);
        segment(ax + CELL_FT, az + CELL_FT, ax, az + CELL_FT);
        segment(ax, az + CELL_FT, ax, az);
      } else if (side === "n") segment(ax, az, ax + CELL_FT, az);
      else segment(ax, az, ax, az + CELL_FT);
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: erase ? COLORS.erase : COLORS.hover, depthTest: false }));
    lines.renderOrder = 3;
    this.hover.add(lines);
  }

  refreshScene() {
    if (!this.built) return;
    disposeStructureGroup(this.built);
    this.scene.remove(this.built);
    this.built = structureGroup(this.structure);
    for (const mesh of this.built.children) {
      if (mesh.userData.level <= this.level) continue;
      Object.assign(mesh.material, { transparent: true, opacity: FADED, depthWrite: false });
    }
    this.scene.add(this.built);
    this.grid.position.y = this.height() + 0.02;
    // Below ground, see through it.
    this.ground.material.opacity = this.level < 0 ? 0.25 : 0.9;
    this.ground.material.depthWrite = this.level >= 0;
  }

  // Looks at the whole structure, or at the middle of the grid when it's empty.
  frame() {
    const box = new THREE.Box3(new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 8, 8));
    for (const s of this.structure.storeys) {
      for (const key of s.floor) {
        const [x, z] = parseCell(key).map((v) => v * CELL_FT);
        box.expandByPoint(new THREE.Vector3(x, s.level * this.structure.storeyFt, z));
        box.expandByPoint(new THREE.Vector3(x + CELL_FT, (s.level + 1) * this.structure.storeyFt, z + CELL_FT));
      }
    }
    const middle = box.getCenter(new THREE.Vector3());
    const reach = box.getSize(new THREE.Vector3()).length();
    this.orbit.target.copy(middle);
    this.camera.position.set(middle.x + reach * 0.6, middle.y + reach * 0.8, middle.z + reach * 0.9);
    this.orbit.update();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.frameId) return;
    const loop = () => {
      if (!this.isOpen) {
        this.frameId = null;
        return;
      }
      if (this.canvas.width !== Math.round(this.canvas.clientWidth * this.renderer.getPixelRatio())) this.resize();
      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(loop);
    };
    this.frameId = requestAnimationFrame(loop);
  }
}

// Grid lines on a storey's floor every `step` feet, out to `reach` each way.
function gridLines(reach, step, color) {
  const points = [];
  for (let v = -reach; v <= reach; v += step) points.push(-reach, 0, v, reach, 0, v, v, 0, -reach, v, 0, reach);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
}
