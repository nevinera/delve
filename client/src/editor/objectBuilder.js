import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { MAX_PIECES, MIN_SIZE_FT, PIECE_TYPES, REACH_FT, addColor, dropUnusedColors, pieceCorners, problems, shapeOf } from "../world/builtObjects.js";
import { primitive } from "./builtMeshes.js";

// The object builder: a dialog over most of the page for putting a built object
// (world/builtObjects.js) together from pieces. The 3D view shows the pieces on a ground grid, a
// ring where they must stay within, the footprint the game will use, and a person for scale.
// Clicking a piece picks it; handles move, turn or size it, and the panel sets its numbers, type
// and color exactly. The palette lists every color the object uses: changing one recolors every
// piece using it, and up to three are parameters. Saving hands the object to onSave.
//
// Right-drag turns the view, middle-drag pans and the wheel zooms, as in the detail step.

const NEW_SIZE = [2, 2, 2];
const NEW_COLOR = "#a08060";
const SNAP = { ft: 0.25, degrees: 5 };
const UNDO_KEEP = 100;
const HANDLES = { move: "translate", turn: "rotate", size: "scale" };
const KEYS = { g: "move", r: "turn", s: "size" };
const PERSON = { heightFt: 6, radiusFt: 0.8, at: [-5, -5] }; // behind and left, as first framed
const COLORS = { grid: 0x555555, gridMajor: 0x777777, reach: 0x8fc4ff, footprint: 0xf0c850, picked: 0xffe066, person: 0x9aa4b0, ground: 0x4a5040, background: 0x20242a };
const HINT = "click a piece to pick it · G moves, R turns, S sizes · right-drag turns the view · middle-drag pans · wheel zooms · delete removes the piece · ctrl-d copies it · ctrl-z undoes, ctrl-shift-z redoes";

// An element with properties and children.
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

const round = (v, step) => Math.round(v / step) * step;
const tidy = (v) => Math.round(v * 100) / 100;
const lowest = (piece) => Math.min(...pieceCorners(piece).map((c) => c[1]));
// Sizing grows a piece about its middle; this moves it back up or down so its bottom stays put.
const keepBase = (piece, base) => (piece.at[1] = tidy(piece.at[1] + base - lowest(piece)));

export class ObjectBuilder {
  // onSave(object) hears the object when it's saved.
  constructor({ onSave }) {
    this.onSave = onSave;
    this.object = null;
    this.picked = null; // the picked piece's index
    this.handle = "move";
    this.undos = [];
    this.redos = [];
    this.buildDom();
  }

  get isOpen() {
    return this.dialog.open;
  }

  // Opens the builder on a copy of `object`.
  open(object) {
    this.object = structuredClone(object);
    this.saved = JSON.stringify(this.object);
    this.undos = [];
    this.redos = [];
    this.picked = null;
    this.dialog.showModal();
    this.setupView();
    this.resize();
    this.frameObject();
    this.refresh();
    this.start();
  }

  close() {
    this.transform?.detach();
    this.dialog.close();
  }

  // --- the dialog ---

  buildDom() {
    const { div, field } = { div: (cls, ...c) => el("div", { className: cls }, ...c), field: (label, input) => el("label", { className: "ob-field" }, label, input) };
    this.canvas = el("canvas", { className: "ob-canvas" });
    this.name = el("input", { type: "text", placeholder: "name" });
    this.name.addEventListener("change", () => this.change(() => (this.object.name = this.name.value.trim() || "unnamed")));

    const add = div("ob-row", ...PIECE_TYPES.map((type) => el("button", { type: "button", textContent: type, onclick: () => this.addPiece(type) })));
    this.handleButtons = Object.keys(HANDLES).map((name) => el("button", { type: "button", textContent: name, onclick: () => this.setHandle(name) }));
    this.snap = el("input", { type: "checkbox", checked: true, onchange: () => this.applySnap() });
    const handles = div("ob-row", ...this.handleButtons, el("label", { className: "ob-check" }, this.snap, el("span", { textContent: "snap" })));

    this.list = el("select", { size: 8, className: "ob-list", onchange: () => this.pick(this.list.value === "" ? null : Number(this.list.value)) });

    // The picked piece's settings.
    this.type = el("select", { onchange: () => this.changePiece((p) => (p.type = this.type.value)) });
    for (const type of PIECE_TYPES) this.type.add(new Option(type, type));
    const numbers = (key, step) =>
      [0, 1, 2].map((axis) => {
        const input = el("input", { type: "number", step });
        input.addEventListener("change", () =>
          this.changePiece((p) => {
            if (key !== "size") return (p[key][axis] = Number(input.value) || 0);
            const base = lowest(p);
            p.size[axis] = Math.max(MIN_SIZE_FT, Number(input.value) || MIN_SIZE_FT);
            keepBase(p, base);
          }),
        );
        return input;
      });
    this.inputs = { size: numbers("size", 0.25), at: numbers("at", 0.25), turn: numbers("turn", 5) };
    this.swatches = div("ob-swatches");
    this.newColor = el("input", { type: "color", value: NEW_COLOR, title: "a new color for this piece" });
    this.newColor.addEventListener("change", () => this.changePiece((p) => (p.color = addColor(this.object, this.newColor.value))));
    this.pieceBox = div(
      "ob-piece",
      field("type", this.type),
      field("size (ft) x y z", div("ob-xyz", ...this.inputs.size)),
      field("at (ft) x y z", div("ob-xyz", ...this.inputs.at)),
      field("turn (°) yaw pitch roll", div("ob-xyz", ...this.inputs.turn)),
      field("color", div("ob-row", this.swatches, this.newColor)),
      div("ob-row", el("button", { type: "button", textContent: "copy", onclick: () => this.copyPiece() }), el("button", { type: "button", textContent: "remove", onclick: () => this.removePiece() })),
    );

    this.palette = div("ob-palette");
    this.problems = el("p", { className: "ob-problems" });
    this.info = el("p", { className: "ob-info" });
    this.saveButton = el("button", { type: "button", textContent: "save", onclick: () => this.save() });
    const footer = div(
      "ob-row ob-footer",
      el("button", { type: "button", textContent: "undo", onclick: () => this.undo() }),
      el("button", { type: "button", textContent: "redo", onclick: () => this.redo() }),
      el("span", { className: "ob-spacer" }),
      el("button", { type: "button", textContent: "cancel", onclick: () => this.cancel() }),
      this.saveButton,
    );

    const panel = div(
      "ob-panel",
      this.name,
      el("h3", { textContent: "add a piece" }),
      add,
      el("h3", { textContent: "pieces" }),
      handles,
      this.list,
      this.pieceBox,
      el("h3", { textContent: "palette" }),
      this.palette,
      this.info,
      this.problems,
      footer,
    );
    this.dialog = el("dialog", { className: "ob" }, div("ob-main", div("ob-view", this.canvas, el("p", { className: "ob-hint", textContent: HINT })), panel));
    document.body.append(this.dialog);
    // Escape asks before throwing changes away.
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.cancel();
    });
    // Keys stay in the builder, away from the editor behind it.
    this.dialog.addEventListener("keydown", (e) => {
      e.stopPropagation();
      this.onKey(e);
    });
    window.addEventListener("resize", () => this.isOpen && this.resize());
  }

  onKey(e) {
    if (e.target.matches("input, select, textarea")) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "z") e.shiftKey ? this.redo() : this.undo();
    else if (ctrl && e.key.toLowerCase() === "d") this.copyPiece();
    else if (!ctrl && KEYS[e.key.toLowerCase()]) this.setHandle(KEYS[e.key.toLowerCase()]);
    else if (e.key === "Delete" || e.key === "Backspace") this.removePiece();
    else return;
    e.preventDefault();
  }

  // --- changes ---

  // Makes a change to the object as one undoable step.
  change(fn) {
    const before = JSON.stringify(this.object);
    fn(this.object);
    if (JSON.stringify(this.object) === before) return this.refresh();
    this.undos.push(before);
    if (this.undos.length > UNDO_KEEP) this.undos.shift();
    this.redos = [];
    this.refresh();
  }

  changePiece(fn) {
    if (this.picked === null) return;
    this.change((object) => fn(object.pieces[this.picked]));
  }

  undo() {
    this.replay(this.undos, this.redos);
  }

  redo() {
    this.replay(this.redos, this.undos);
  }

  replay(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(this.object));
    this.object = JSON.parse(from.pop());
    if (this.picked !== null && this.picked >= this.object.pieces.length) this.picked = null;
    this.refresh();
  }

  addPiece(type) {
    if (this.object.pieces.length >= MAX_PIECES) return;
    this.change((object) => {
      const color = this.picked !== null ? object.pieces[this.picked].color : addColor(object, NEW_COLOR);
      object.pieces.push({ type, size: [...NEW_SIZE], at: [0, NEW_SIZE[1] / 2, 0], turn: [0, 0, 0], color });
    });
    this.picked = this.object.pieces.length - 1;
    this.refresh();
  }

  // A copy of the picked piece, beside it.
  copyPiece() {
    if (this.picked === null || this.object.pieces.length >= MAX_PIECES) return;
    this.change((object) => {
      const copy = structuredClone(object.pieces[this.picked]);
      copy.at[0] = tidy(copy.at[0] + copy.size[0]);
      object.pieces.push(copy);
    });
    this.picked = this.object.pieces.length - 1;
    this.refresh();
  }

  removePiece() {
    if (this.picked === null) return;
    const n = this.picked;
    this.picked = null;
    this.change((object) => object.pieces.splice(n, 1));
  }

  pick(n) {
    this.picked = n;
    this.refresh();
  }

  setHandle(name) {
    this.handle = name;
    this.transform?.setMode(HANDLES[name]);
    this.transform?.setSpace(name === "move" ? "world" : "local");
    this.refreshPanel();
  }

  applySnap() {
    const on = this.snap.checked;
    this.transform?.setTranslationSnap(on ? SNAP.ft : null);
    this.transform?.setRotationSnap(on ? THREE.MathUtils.degToRad(SNAP.degrees) : null);
    this.transform?.setScaleSnap(on ? SNAP.ft : null);
  }

  save() {
    const object = structuredClone(this.object);
    dropUnusedColors(object);
    if (problems(object).length) return;
    this.onSave?.(object);
    this.close();
  }

  cancel() {
    if (JSON.stringify(this.object) !== this.saved && !window.confirm("Throw away the changes to this object?")) return;
    this.close();
  }

  // --- the panel ---

  refresh() {
    this.refreshPanel();
    this.refreshScene();
  }

  refreshPanel() {
    const { object } = this;
    this.name.value = object.name;
    for (const b of this.handleButtons) b.classList.toggle("active", b.textContent === this.handle);

    this.list.replaceChildren(
      ...object.pieces.map((piece, n) => {
        return new Option(`${n + 1}. ${piece.type} ${piece.size.map(tidy).join("×")}`, n, false, n === this.picked);
      }),
    );

    const piece = this.picked !== null ? object.pieces[this.picked] : null;
    this.pieceBox.hidden = !piece;
    if (piece) {
      this.type.value = piece.type;
      for (const key of ["size", "at", "turn"]) this.inputs[key].forEach((input, axis) => (input.value = tidy(piece[key][axis])));
      this.swatches.replaceChildren(
        ...object.palette.map((p, i) => {
          const b = el("button", { type: "button", className: `ob-swatch${i === piece.color ? " active" : ""}`, title: p.color });
          b.style.background = p.color;
          b.addEventListener("click", () => this.changePiece((x) => (x.color = i)));
          return b;
        }),
      );
    }

    this.palette.replaceChildren(
      ...object.palette.map((p, i) => {
        const uses = object.pieces.filter((x) => x.color === i).length;
        const color = el("input", { type: "color", value: p.color, title: "changes every piece of this color" });
        color.addEventListener("change", () => this.change((o) => (o.palette[i].color = color.value)));
        const param = el("input", { type: "checkbox", checked: Boolean(p.param) });
        param.addEventListener("change", () => this.change((o) => (o.palette[i].param = param.checked)));
        const name = el("input", { type: "text", value: p.name ?? "", placeholder: p.param ? "parameter name" : "", disabled: !p.param });
        name.addEventListener("change", () => this.change((o) => (name.value.trim() ? (o.palette[i].name = name.value.trim()) : delete o.palette[i].name)));
        return el("div", { className: "ob-palette-row" }, color, el("label", { className: "ob-check" }, param, el("span", { textContent: "parameter" })), name, el("span", { className: "ob-uses", textContent: `${uses} piece${uses === 1 ? "" : "s"}` }));
      }),
    );

    const wrong = problems(object);
    const { footprint, height } = shapeOf(object);
    this.info.textContent = `${object.pieces.length} of ${MAX_PIECES} pieces · ${tidy(height)} ft tall · blocks ${footprint.circle !== undefined ? `a circle ${tidy(footprint.circle * 2)} ft across` : `${footprint.rect.map(tidy).join(" × ")} ft`}`;
    this.saveButton.disabled = wrong.length > 0 || !object.pieces.length;
    // Not a problem (a foundation on a slope wants it), but easy to do by accident.
    const below = Math.min(0, ...object.pieces.map(lowest));
    const sunk = below < -0.05 ? [`note: pieces reach ${tidy(-below)} ft below the ground`] : [];
    this.problems.textContent = [...wrong, ...sunk].join(" · ");
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
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

    const grid = new THREE.GridHelper(REACH_FT * 2, REACH_FT * 2, COLORS.gridMajor, COLORS.grid);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);
    // Solid ground, so pieces sunk below it look sunk.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(REACH_FT * 1.5, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: COLORS.ground, transparent: true, opacity: 0.85 }));
    ground.position.y = -0.01;
    this.scene.add(ground);
    this.scene.add(ring(REACH_FT, COLORS.reach));
    const person = new THREE.Mesh(new THREE.CapsuleGeometry(PERSON.radiusFt, PERSON.heightFt - PERSON.radiusFt * 2, 4, 8), new THREE.MeshLambertMaterial({ color: COLORS.person, transparent: true, opacity: 0.45 }));
    person.position.set(PERSON.at[0], PERSON.heightFt / 2, PERSON.at[1]);
    this.scene.add(person);

    this.pieces = new THREE.Group();
    this.scene.add(this.pieces);
    this.marks = new THREE.Group();
    this.scene.add(this.marks);

    this.orbit = new OrbitControls(this.camera, this.canvas);
    this.orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.orbit.screenSpacePanning = false;
    this.transform = new TransformControls(this.camera, this.canvas);
    this.transform.setSize(0.9);
    this.scene.add(this.transform.getHelper());
    this.transform.addEventListener("dragging-changed", (e) => {
      this.orbit.enabled = !e.value;
      if (e.value) {
        this.dragFrom = JSON.stringify(this.object);
        this.dragBase = lowest(this.object.pieces[this.picked]);
      }
      else this.endDrag();
    });
    this.transform.addEventListener("objectChange", () => this.readHandles());
    this.setHandle(this.handle);
    this.applySnap();

    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || this.transform.axis) return;
      const r = this.canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      const hit = ray.intersectObjects(this.pieces.children, false)[0];
      this.pick(hit ? hit.object.userData.index : null);
    });
  }

  // The picked piece's numbers from its mesh, as the handles move it.
  readHandles() {
    const mesh = this.transform.object;
    const piece = this.object.pieces[this.picked];
    if (!mesh || !piece) return;
    piece.at = mesh.position.toArray().map((v) => tidy(v));
    const r = mesh.rotation;
    piece.turn = [r.y, r.x, r.z].map((v) => round(THREE.MathUtils.radToDeg(v), 0.1));
    piece.size = mesh.scale.toArray().map((v) => Math.max(MIN_SIZE_FT, tidy(Math.abs(v))));
    if (this.handle === "size") {
      keepBase(piece, this.dragBase);
      mesh.position.y = piece.at[1];
    }
    this.refreshPanel();
    this.drawMarks();
  }

  // A drag of the handles is one undoable step.
  endDrag() {
    if (this.dragFrom && this.dragFrom !== JSON.stringify(this.object)) {
      this.undos.push(this.dragFrom);
      this.redos = [];
    }
    this.dragFrom = null;
    this.refresh();
  }

  refreshScene() {
    if (!this.pieces) return;
    for (const mesh of [...this.pieces.children]) {
      mesh.material.dispose();
      this.pieces.remove(mesh);
    }
    this.transform.detach();
    this.object.pieces.forEach((piece, n) => {
      const color = this.object.palette[piece.color]?.color ?? "#ff00ff";
      const mesh = new THREE.Mesh(primitive(piece.type), new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: n === this.picked ? 0x332a10 : 0x000000 }));
      mesh.position.set(...piece.at);
      mesh.rotation.set(THREE.MathUtils.degToRad(piece.turn[1]), THREE.MathUtils.degToRad(piece.turn[0]), THREE.MathUtils.degToRad(piece.turn[2]), "YXZ");
      mesh.scale.set(...piece.size);
      mesh.userData.index = n;
      this.pieces.add(mesh);
      if (n === this.picked) this.transform.attach(mesh);
    });
    this.drawMarks();
  }

  // The footprint the game will use, on the ground.
  drawMarks() {
    for (const child of [...this.marks.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.marks.remove(child);
    }
    if (!this.object.pieces.length) return;
    const { footprint } = shapeOf(this.object);
    if (footprint.circle !== undefined) this.marks.add(ring(footprint.circle, COLORS.footprint));
    else {
      const [w, d] = footprint.rect.map((v) => v / 2);
      const points = [[-w, -d], [w, -d], [w, d], [-w, d], [-w, -d]].map(([x, z]) => new THREE.Vector3(x, 0.03, z));
      this.marks.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: COLORS.footprint })));
    }
  }

  // Looks at the whole object, or at where one would stand.
  frameObject() {
    const box = new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, PERSON.heightFt, 3));
    for (const piece of this.object.pieces) for (const corner of pieceCorners(piece)) box.expandByPoint(new THREE.Vector3(...corner));
    const middle = box.getCenter(new THREE.Vector3());
    const reach = box.getSize(new THREE.Vector3()).length();
    this.orbit.target.copy(middle);
    this.camera.position.set(middle.x + reach * 0.7, middle.y + reach * 0.6, middle.z + reach * 0.9);
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
    if (this.frame) return;
    const loop = () => {
      if (!this.isOpen) {
        this.frame = null;
        return;
      }
      if (this.canvas.width !== Math.round(this.canvas.clientWidth * this.renderer.getPixelRatio())) this.resize();
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }
}

// A circle on the ground.
function ring(radius, color) {
  const points = Array.from({ length: 65 }, (_, n) => {
    const a = (n / 64) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * radius, 0.03, Math.sin(a) * radius);
  });
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color }));
}
