import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { MAX_PIECES, MIN_SIZE_FT, PIECE_TYPES, REACH_FT, addColor, dropUnusedColors, pieceCorners, problems, shapeOf, turnPoint } from "../world/builtObjects.js";
import { builtMaterial, objectGeometry, primitive } from "./builtMeshes.js";
import { characterClips, loadAnimations } from "../character/animations.js";
import { characterMesh, disposeCharacter } from "../character/characterMesh.js";
import { randomLook } from "../character/recipe.js";

// The object builder: a dialog over most of the page for putting a built object
// (world/builtObjects.js) together from pieces. The 3D view shows the pieces on a ground grid (1 ft,
// heavier every 5 ft), the object's axes, a ring where they must stay within, the footprint the
// game will use, and on asking, a person for scale. Clicking a piece picks it and fades the rest; handles
// move, turn or size it along its own axes, sizing from the face opposite the handle, and the panel
// sets its type, color, taper, whether it's a hole and, as a last resort, exact numbers. Holes show
// as red glass while a piece is picked; with none picked the object shows as the game draws it,
// holes cut.
//
// Opened read-only (a builtin or imported object), it shows the object and offers to copy it into
// one of the world's own collections instead of saving. The palette lists every color the object uses: changing one recolors every
// piece using it, and up to three are parameters. Saving hands the object to onSave.
//
// Right-drag turns the view, middle-drag pans and the wheel zooms, as in the detail step.

const NEW_SIZE = [2, 2, 2];
const NEW_COLOR = "#a08060";
const SNAP = { ft: 0.25, degrees: 5 };
const UNDO_KEEP = 100;
const HANDLES = { move: "translate", turn: "rotate", size: "scale" };
const KEYS = { g: "move", r: "turn", s: "size" };
// The person for scale stands to the left as first framed (frameObject looks from +x, +z), where
// the object won't hide it, twice as far out as the object reaches, and at least nearestFt.
const PERSON = { heightFt: 6, nearestFt: 4, toward: new THREE.Vector2(-0.9, 0.7).normalize() };
const TICKS = { minorFt: 0.15, majorFt: 0.4 }; // the vertical axis's discs' radii, at each foot and every 5
const LABEL_FT = 10; // how far out along each axis its label sits
const FADED = 0.25; // how much of the unpicked pieces shows while one is picked
const HOLE = { color: 0xff4040, opacity: 0.3 };
const AXES = { x: { color: 0xe05a5a, label: "x east" }, y: { color: 0x6ad06a, label: "y up" }, z: { color: 0x5a8ae0, label: "z south" } };
const COLORS = { grid: 0x626a58, gridMajor: 0x9aa48c, reach: 0x8fc4ff, footprint: 0xf0c850, picked: 0xffe066, ground: 0x4a5040, background: 0x20242a };
const HINT = "click a piece to pick it · G moves, R turns, S sizes, all along the piece's own axes · W toggles moving along the world's · F frames the object · right-drag turns the view · middle-drag pans · wheel zooms · delete removes the piece · ctrl-d copies it · ctrl-z undoes, ctrl-shift-z redoes";

// An element with properties and children.
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

const round = (v, step) => Math.round(v / step) * step;
const tidy = (v) => Math.round(v * 100) / 100;
const lowest = (piece) => Math.min(...pieceCorners(piece).map((c) => c[1]));
// Sizes `piece` to `size` from `from` (the piece before), growing each axis toward `sides`: 1 grows
// the positive end and keeps the negative face still, -1 the reverse, 0 grows both ends alike.
// Typed sizes grow upward and evenly across.
function sizeFrom(piece, from, size, sides = [0, 1, 0]) {
  const shift = turnPoint(size.map((s, axis) => (sides[axis] * (s - from.size[axis])) / 2), from.turn);
  piece.size = size;
  piece.at = from.at.map((v, axis) => tidy(v + shift[axis]));
}

export class ObjectBuilder {
  // onSave(object) hears the object when it's saved, onDelete(object) when deleting it is asked for.
  constructor({ onSave, onDelete }) {
    this.onSave = onSave;
    this.onDelete = onDelete;
    this.object = null;
    this.picked = null; // the picked piece's index
    this.handle = "move";
    this.worldMoves = false; // moving along the world's axes instead of the piece's
    this.undos = [];
    this.redos = [];
    this.buildDom();
  }

  get isOpen() {
    return this.dialog.open;
  }

  // Opens the builder on a copy of `object`.
  // Opens the builder on a copy of `object`. collections: the world's own, [{ id, name }], to move
  // it between or copy it into. readOnly: look, don't touch; onCopy(object, collectionId) hears a
  // copy asked for.
  open(object, { collections = [], readOnly = false, onCopy } = {}) {
    this.readOnly = readOnly;
    this.onCopy = onCopy;
    for (const select of [this.collection, this.copyTo]) select.replaceChildren(...collections.map((c) => new Option(c.name, c.id)));
    this.dialog.classList.toggle("ob-readonly", readOnly);
    for (const node of [this.pieceBox, this.palette, this.details]) node.inert = readOnly;
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
    // Focusable, so keys reach the builder once the view's been used.
    this.canvas = el("canvas", { className: "ob-canvas", tabIndex: -1 });
    this.name = el("input", { type: "text", placeholder: "name" });
    this.name.addEventListener("change", () => this.change(() => (this.object.name = this.name.value.trim() || "unnamed")));
    this.tags = el("input", { type: "text", placeholder: "tags, by commas" });
    this.tags.addEventListener("change", () =>
      this.change((o) => {
        const tags = this.tags.value.split(",").map((t) => t.trim()).filter(Boolean);
        if (tags.length) o.tags = tags;
        else delete o.tags;
      }),
    );
    this.collection = el("select", { title: "the collection it's in", onchange: () => this.change((o) => (o.collection = this.collection.value)) });
    this.details = div("ob-details", this.name, this.tags, el("label", { className: "ob-field" }, "collection", this.collection));

    const add = div("ob-row", ...PIECE_TYPES.map((type) => el("button", { type: "button", textContent: type, onclick: () => this.addPiece(type) })));
    this.handleButtons = Object.keys(HANDLES).map((name) => el("button", { type: "button", textContent: name, onclick: () => this.setHandle(name) }));
    this.snap = el("input", { type: "checkbox", checked: true, onchange: () => this.applySnap() });
    this.personBox = el("input", { type: "checkbox", onchange: () => (this.canvas.focus(), this.showPerson(this.personBox.checked)) });
    this.worldBox = el("input", { type: "checkbox", onchange: () => ((this.worldMoves = this.worldBox.checked), this.setHandle(this.handle)) });
    const handles = div("ob-row", ...this.handleButtons, el("label", { className: "ob-check" }, this.snap, el("span", { textContent: "snap" })), el("label", { className: "ob-check", title: "move along the world's axes, not the piece's (W)" }, this.worldBox, el("span", { textContent: "world" })), el("label", { className: "ob-check ob-person", title: "a random character beside the object, for scale" }, this.personBox, el("span", { textContent: "person" })));

    this.list = el("select", { size: 8, className: "ob-list", onchange: () => this.pick(this.list.value === "" ? null : Number(this.list.value)) });

    // The picked piece's settings.
    this.type = el("select", {
      onchange: () =>
        this.changePiece((p) => {
          p.type = this.type.value;
          if (p.type !== "cylinder") delete p.taper;
        }),
    });
    this.taper = el("input", { type: "range", min: 0, max: 1, step: 0.05 });
    this.taper.addEventListener("input", () => this.taperPiece(Number(this.taper.value)));
    this.taper.addEventListener("change", () => this.endTaper());
    this.taperField = field("taper (top over bottom)", this.taper);
    this.cut = el("input", { type: "checkbox", onchange: () => this.changePiece((p) => (this.cut.checked ? (p.cut = true) : delete p.cut)) });
    for (const type of PIECE_TYPES) this.type.add(new Option(type, type));
    const numbers = (key, step) =>
      [0, 1, 2].map((axis) => {
        const input = el("input", { type: "number", step });
        input.addEventListener("change", () =>
          this.changePiece((p) => {
            if (key !== "size") return (p[key][axis] = Number(input.value) || 0);
            const size = [...p.size];
            size[axis] = Math.max(MIN_SIZE_FT, Number(input.value) || MIN_SIZE_FT);
            sizeFrom(p, structuredClone(p), size);
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
      this.taperField,
      el("label", { className: "ob-check", title: "take this piece out of the others, as a hole; its color colors the hole's sides" }, this.cut, el("span", { textContent: "hole" })),
      field("color", div("ob-row", this.swatches, this.newColor)),
      el(
        "details",
        { className: "ob-numbers" },
        el("summary", { textContent: "exact numbers" }),
        field("size (ft) x y z", div("ob-xyz", ...this.inputs.size)),
        field("at (ft) x y z", div("ob-xyz", ...this.inputs.at)),
        field("turn (°) yaw pitch roll", div("ob-xyz", ...this.inputs.turn)),
      ),
      div("ob-row", el("button", { type: "button", textContent: "copy", onclick: () => this.copyPiece() }), el("button", { type: "button", textContent: "remove", onclick: () => this.removePiece() })),
    );

    this.palette = div("ob-palette");
    this.problems = el("p", { className: "ob-problems" });
    this.info = el("p", { className: "ob-info" });
    this.saveButton = el("button", { type: "button", textContent: "save", onclick: () => this.save() });
    this.copyTo = el("select", { title: "your collection to copy it into" });
    const footer = div(
      "ob-row ob-footer",
      el("button", { type: "button", className: "ob-edit", textContent: "undo", onclick: () => this.undo() }),
      el("button", { type: "button", className: "ob-edit", textContent: "redo", onclick: () => this.redo() }),
      el("span", { className: "ob-view-only", textContent: "read-only · copy into" }),
      el("span", { className: "ob-view-only" }, this.copyTo),
      el("button", { type: "button", className: "ob-view-only", textContent: "copy", onclick: () => this.copy() }),
      el("span", { className: "ob-spacer" }),
      el("button", { type: "button", className: "ob-edit", textContent: "delete", title: "delete this object from the world", onclick: () => this.onDelete?.(this.object) }),
      el("button", { type: "button", textContent: "close", className: "ob-view-only", onclick: () => this.close() }),
      el("button", { type: "button", className: "ob-edit", textContent: "cancel", onclick: () => this.cancel() }),
      this.saveButton,
    );
    this.saveButton.classList.add("ob-edit");
    add.classList.add("ob-edit");
    handles.classList.add("ob-edit");

    const panel = div(
      "ob-panel",
      this.details,
      el("h3", { className: "ob-edit", textContent: "add a piece" }),
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
    if (this.readOnly) {
      if (!ctrl && e.key.toLowerCase() === "f") this.frameObject();
      return;
    }
    if (ctrl && e.key.toLowerCase() === "z") e.shiftKey ? this.redo() : this.undo();
    else if (ctrl && e.key.toLowerCase() === "d") this.copyPiece();
    else if (!ctrl && KEYS[e.key.toLowerCase()]) this.setHandle(KEYS[e.key.toLowerCase()]);
    else if (!ctrl && e.key.toLowerCase() === "w") this.worldBox.click();
    else if (!ctrl && e.key.toLowerCase() === "f") this.frameObject();
    else if (e.key === "Delete" || e.key === "Backspace") this.removePiece();
    else return;
    e.preventDefault();
  }

  // --- changes ---

  // Makes a change to the object as one undoable step.
  change(fn) {
    if (this.readOnly) return;
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

  // Tapers the picked piece live as the slider moves, one undoable step per drag.
  taperPiece(taper) {
    const piece = this.object.pieces[this.picked];
    if (!piece) return;
    this.taperFrom ??= JSON.stringify(this.object);
    if (taper === 1) delete piece.taper;
    else piece.taper = taper;
    this.refreshScene();
  }

  endTaper() {
    if (this.taperFrom && this.taperFrom !== JSON.stringify(this.object)) {
      this.undos.push(this.taperFrom);
      this.redos = [];
    }
    this.taperFrom = null;
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
    this.transform?.setSpace(name === "move" && this.worldMoves ? "world" : "local");
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

  copy() {
    if (!this.copyTo.value) return window.alert("Make a collection of your own to copy it into first.");
    this.onCopy?.(structuredClone(this.object), this.copyTo.value);
  }

  cancel() {
    if (this.readOnly) return this.close();
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
    this.tags.value = (object.tags ?? []).join(", ");
    this.collection.value = object.collection ?? "";
    for (const b of this.handleButtons) b.classList.toggle("active", b.textContent === this.handle);
    this.worldBox.checked = this.worldMoves;

    this.list.replaceChildren(
      ...object.pieces.map((piece, n) => {
        return new Option(`${n + 1}. ${piece.cut ? "hole: " : ""}${piece.type} ${piece.size.map(tidy).join("×")}`, n, false, n === this.picked);
      }),
    );

    const piece = this.picked !== null ? object.pieces[this.picked] : null;
    this.pieceBox.hidden = !piece;
    if (piece) {
      this.type.value = piece.type;
      this.taperField.hidden = piece.type !== "cylinder";
      this.taper.value = piece.taper ?? 1;
      this.cut.checked = Boolean(piece.cut);
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

    this.scene.add(grid(REACH_FT + 3, 1, COLORS.grid), grid(REACH_FT + 3, 5, COLORS.gridMajor), axes(REACH_FT));
    // Solid ground, so pieces sunk below it look sunk.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(REACH_FT * 1.5, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: COLORS.ground, transparent: true, opacity: 0.85 }));
    ground.position.y = -0.01;
    this.scene.add(ground);
    this.scene.add(ring(REACH_FT, COLORS.reach));
    this.clock = new THREE.Clock();

    this.pieces = new THREE.Group();
    this.scene.add(this.pieces);
    this.whole = new THREE.Mesh(new THREE.BufferGeometry(), builtMaterial());
    this.scene.add(this.whole);
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
        this.dragPiece = structuredClone(this.object.pieces[this.picked]);
        // Which end of each axis the grabbed size handle is on; the middle one grows upward.
        const grabbed = this.transform.pointStart.clone().applyQuaternion(this.transform.object.quaternion.clone().invert());
        this.dragSides = this.transform.axis === "XYZ" ? [0, 1, 0] : grabbed.toArray().map((v) => Math.sign(v) || 1);
      } else this.endDrag();
    });
    this.transform.addEventListener("objectChange", () => this.readHandles());
    this.setHandle(this.handle);
    this.applySnap();

    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.focus();
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
    if (this.handle === "size") {
      sizeFrom(piece, this.dragPiece, mesh.scale.toArray().map((v) => Math.max(MIN_SIZE_FT, tidy(Math.abs(v)))), this.dragSides);
      mesh.position.set(...piece.at);
    } else {
      piece.at = mesh.position.toArray().map((v) => tidy(v));
      const r = mesh.rotation;
      piece.turn = [r.y, r.x, r.z].map((v) => round(THREE.MathUtils.radToDeg(v), 0.1));
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
    this.whole.geometry?.dispose();
    // With nothing picked and holes to cut, the pieces only catch clicks, and the whole object
    // shows as the game draws it.
    const whole = this.picked === null && this.object.pieces.some((p) => p.cut) ? objectGeometry(this.object) : null;
    this.whole.geometry = whole ?? new THREE.BufferGeometry();
    this.object.pieces.forEach((piece, n) => {
      const color = piece.cut ? HOLE.color : (this.object.palette[piece.color]?.color ?? "#ff00ff");
      const faded = this.picked !== null && n !== this.picked;
      const opacity = piece.cut ? HOLE.opacity : faded ? FADED : 1;
      const mesh = new THREE.Mesh(primitive(piece.type, piece.taper), new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: n === this.picked ? 0x332a10 : 0x000000, transparent: opacity < 1, opacity, depthWrite: opacity === 1, visible: !whole }));
      mesh.position.set(...piece.at);
      mesh.rotation.set(THREE.MathUtils.degToRad(piece.turn[1]), THREE.MathUtils.degToRad(piece.turn[0]), THREE.MathUtils.degToRad(piece.turn[2]), "YXZ");
      mesh.scale.set(...piece.size);
      mesh.userData.index = n;
      this.pieces.add(mesh);
      if (n === this.picked && !this.readOnly) this.transform.attach(mesh);
    });
    this.drawMarks();
  }

  // A random character for scale, as walking makes, idling beside the object; or none.
  showPerson(on) {
    if (this.person) {
      this.scene.remove(this.person);
      disposeCharacter(this.person);
      this.person = this.mixer = null;
    }
    if (!on) return;
    const person = characterMesh({ ...randomLook(), sheathed: true });
    this.person = person;
    this.mixer = new THREE.AnimationMixer(person);
    this.scene.add(person);
    this.placePerson();
    loadAnimations().then((baked) => {
      const idle = this.person === person && characterClips(person, baked).get("Idle_Loop");
      if (idle) this.mixer.clipAction(idle).play();
    });
  }

  // How far out the object reaches across the ground from its centre.
  reach() {
    return Math.max(0, ...this.object.pieces.flatMap((p) => pieceCorners(p).map(([x, , z]) => Math.hypot(x, z))));
  }

  placePerson() {
    if (!this.person) return;
    const d = Math.max(PERSON.nearestFt, 2 * this.reach());
    this.person.position.set(PERSON.toward.x * d, 0, PERSON.toward.y * d);
    // Facing the object.
    this.person.rotation.y = Math.atan2(-PERSON.toward.x, -PERSON.toward.y);
  }

  // The footprint the game will use, on the ground.
  drawMarks() {
    this.placePerson();
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
    if (this.person) box.expandByPoint(this.person.position.clone().setY(PERSON.heightFt));
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
      this.mixer?.update(this.clock.getDelta());
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }
}

// Grid lines on the ground every `step` feet, out to `reach` each way.
function grid(reach, step, color) {
  const points = [];
  const end = Math.floor(reach / step) * step;
  for (let v = -end; v <= end; v += step) points.push(-end, 0.01, v, end, 0.01, v, v, 0.01, -end, v, 0.01, end);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
}

// The object's axes through its centre, each labelled at its positive end.
function axes(reach) {
  const group = new THREE.Group();
  const ends = { x: [[-reach, 0.02, 0], [reach, 0.02, 0]], y: [[0, 0, 0], [0, reach / 2, 0]], z: [[0, 0.02, -reach], [0, 0.02, reach]] };
  for (const [axis, { color, label }] of Object.entries(AXES)) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ends[axis].map((p) => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 }));
    line.renderOrder = 1;
    group.add(line, textSprite(label, color, ends[axis][1].map((v, i) => (i === "xyz".indexOf(axis) ? LABEL_FT : v))));
  }
  // Discs up the vertical axis every foot, bigger every 5.
  const material = new THREE.MeshBasicMaterial({ color: AXES.y.color, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.8 });
  for (let y = 1; y <= reach / 2; y++) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(y % 5 ? TICKS.minorFt : TICKS.majorFt, 16).rotateX(-Math.PI / 2), material);
    disc.position.y = y;
    disc.renderOrder = 1;
    group.add(disc);
  }
  return group;
}

function textSprite(text, color, at) {
  const canvas = Object.assign(document.createElement("canvas"), { width: 256, height: 64 });
  const g = canvas.getContext("2d");
  g.font = "bold 36px monospace";
  g.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, sizeAttenuation: false }));
  // The same size on screen however near.
  sprite.scale.set(0.12, 0.03, 1);
  sprite.position.set(at[0], at[1] + 0.5, at[2]);
  sprite.renderOrder = 2;
  return sprite;
}

// A circle on the ground.
function ring(radius, color) {
  const points = Array.from({ length: 65 }, (_, n) => {
    const a = (n / 64) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * radius, 0.03, Math.sin(a) * radius);
  });
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color }));
}
