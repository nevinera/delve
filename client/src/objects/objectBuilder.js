import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GRAY_INKS, MAX_PIECES, newObjectId, MIN_SIZE_FT, PIECE_TYPES, REACH_FT, PALETTE_INKS, addColor, dropUnusedColors, emptyImage, inkColor, paletteColors, pieceCorners, problems, shapeOf, textsOf, tintable, turnPoint } from "../world/builtObjects.js";
import { MAX_TEXT, TEXT_PLACEHOLDER, signText } from "../world/pixelFont.js";
import { atlasTexture, builtMaterial, decalGeometry, decalMaterial, faceFrame, faceIdOf, faceSpot, objectGeometry, primitive, textGeometry, tileTexture, tiledGeometries, tiledMaterial } from "../render/builtMeshes.js";
import { ImagePainter, drawImage } from "./imagePainter.js";
import { swatchPicker } from "../create/swatches.js";
import { objectMesh } from "../world/shapes.js";
import { characterClips, loadAnimations } from "../character/animations.js";
import { characterMesh, disposeCharacter } from "../character/characterMesh.js";
import { randomLook } from "../character/recipe.js";

// The object builder: a dialog over most of the page for putting a built object
// (world/builtObjects.js) together from pieces. The 3D view shows the pieces on a ground grid (1 ft,
// heavier every 5 ft), the object's axes, a ring where they must stay within, the footprint the
// game will use, and on asking, a person for scale and the outline the game tests line of sight
// against. "cut" cuts a hole through that outline: click its corners as you see the object, and
// Enter cuts it right through, the way it looked from there. Clicking a piece picks it and fades the rest; handles
// move, turn or size it along its own axes, sizing from the face opposite the handle, and the panel
// sets its type, color, taper, whether it's a hole and, as a last resort, exact numbers. Holes show
// as red glass while a piece is picked; with none picked the object shows as the game draws it,
// holes cut. Decals go on the picked piece: pick a decal image, then click a face to put it there.
// A tiled image covers the picked piece, repeated every so many feet. Texts go on faces as decals
// do, each a parameter a placement can fill in; the panel's texts section names them and says
// what each says by default. An empty one shows part of the alphabet here.
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
const TICKS = { minorFt: 0.5 / 12, majorFt: 1 / 12 }; // the vertical axis's discs' radii, at each foot and every 5
const LABEL_FT = 10; // how far out along each axis its label sits
const FADED = 0.25; // how much of the unpicked pieces shows while one is picked
const HOLE = { color: 0xff4040, opacity: 0.3 };
const AXES = { x: { color: 0xe05a5a, label: "x east" }, y: { color: 0x6ad06a, label: "y up" }, z: { color: 0x5a8ae0, label: "z south" } };
const COLORS = { grid: 0x626a58, gridMajor: 0x9aa48c, reach: 0x8fc4ff, footprint: 0xf0c850, sight: 0xff8a5c, cut: 0xff4060, picked: 0xffe066, ground: 0x4a5040, background: 0x20242a };
const HINT = "click a piece to pick it · G moves, R turns, S sizes, all along the piece's own axes · W toggles moving along the world's · F frames the object · right-drag turns the view · middle-drag, shift-right-drag or the arrow keys pan · wheel zooms · delete removes the piece · ctrl-d copies it · ctrl-z undoes, ctrl-shift-z redoes";

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
  // onSave(object) hears the object when it's saved, onSaveCopy(object) when it's saved as a copy
  // instead, and onDelete(object) when deleting it is asked for. onSaveImage(image) and
  // onDeleteImage(image) are the same for its collection's images.
  constructor({ onSave, onSaveCopy, onDelete, onSaveImage, onDeleteImage }) {
    this.onSaveImage = onSaveImage;
    this.onDeleteImage = onDeleteImage;
    this.painter = new ImagePainter({
      onSave: (image) => this.onSaveImage?.(image),
      onDelete: (image) => this.onDeleteImage?.(image),
    });
    this.onSave = onSave;
    this.onSaveCopy = onSaveCopy;
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
  // copy asked for. images(): the images it can wear, the world's and the builtins.
  open(object, { collections = [], readOnly = false, onCopy, images = () => [] } = {}) {
    this.placing = null;
    this.cutting = null;
    this.readOnly = readOnly;
    this.images = images;
    this.onCopy = onCopy;
    for (const select of [this.collection, this.copyTo]) select.replaceChildren(...collections.map((c) => new Option(c.name, c.id)));
    this.dialog.classList.toggle("ob-readonly", readOnly);
    for (const node of [this.pieceBox, this.palette, this.details, this.imageList]) node.inert = readOnly;
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
    this.sight = el("input", { type: "checkbox", onchange: () => this.change((o) => (this.sight.checked ? delete o.blocksSight : (o.blocksSight = false))) });
    const sight = el("label", { className: "ob-check", title: "whether it blocks line of sight: the game uses the outline drawn around it" }, this.sight, el("span", { textContent: "blocks sight" }));
    this.details = div("ob-details", this.name, this.tags, el("label", { className: "ob-field" }, "collection", this.collection), sight);

    const add = div("ob-row", ...PIECE_TYPES.map((type) => el("button", { type: "button", textContent: type, onclick: () => this.addPiece(type) })));
    this.handleButtons = Object.keys(HANDLES).map((name) => el("button", { type: "button", textContent: name, onclick: () => this.setHandle(name) }));
    this.snap = el("input", { type: "checkbox", checked: true, onchange: () => this.applySnap() });
    this.personBox = el("input", { type: "checkbox", onchange: () => (this.canvas.focus(), this.showPerson(this.personBox.checked)) });
    this.worldBox = el("input", { type: "checkbox", onchange: () => ((this.worldMoves = this.worldBox.checked), this.setHandle(this.handle)) });
    this.hullBox = el("input", { type: "checkbox", onchange: () => (this.canvas.focus(), this.drawMarks()) });
    const handles = div("ob-row", ...this.handleButtons, el("label", { className: "ob-check" }, this.snap, el("span", { textContent: "snap" })), el("label", { className: "ob-check", title: "move along the world's axes, not the piece's (W)" }, this.worldBox, el("span", { textContent: "world" })), el("label", { className: "ob-check ob-person", title: "a random character beside the object, for scale" }, this.personBox, el("span", { textContent: "person" })));
    this.cutButton = el("button", { type: "button", className: "ob-edit", textContent: "cut", title: "cut a hole through the sight outline: click its corners as you see the object", onclick: () => this.startCut() });
    const clearCuts = el("button", { type: "button", className: "ob-edit", textContent: "clear cuts", onclick: () => this.change((o) => delete o.sightCuts) });
    this.faceCount = el("span", { className: "ob-info", title: "how many faces the game tests line of sight against" });
    this.sightRow = div("ob-row", el("label", { className: "ob-check", title: "the outline the game tests line of sight against" }, this.hullBox, el("span", { textContent: "sight outline" })), this.cutButton, clearCuts, this.faceCount);

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
    this.colorBox = div("ob-row");
    this.pieceBox = div(
      "ob-piece",
      field("type", this.type),
      this.taperField,
      el("label", { className: "ob-check", title: "take this piece out of the others, as a hole; its color colors the hole's sides" }, this.cut, el("span", { textContent: "hole" })),
      field("color", this.colorBox),
      el(
        "details",
        { className: "ob-numbers" },
        el("summary", { textContent: "exact numbers" }),
        field("size (ft) x y z", div("ob-xyz", ...this.inputs.size)),
        field("at (ft) x y z", div("ob-xyz", ...this.inputs.at)),
        field("turn (°) yaw pitch roll", div("ob-xyz", ...this.inputs.turn)),
      ),
      field("decals", (this.decalList = div("ob-decals"))),
      field("texts", (this.textList = div("ob-decals"))),
      field("tiled image", (this.tileBox = div("ob-decals"))),
      div("ob-row", el("button", { type: "button", textContent: "copy", onclick: () => this.copyPiece() }), el("button", { type: "button", textContent: "remove", onclick: () => this.removePiece() })),
    );

    this.palette = div("ob-palette");
    this.imageList = div("ob-images");
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
      el("button", { type: "button", className: "ob-edit", textContent: "save as copy", title: "save this as a new object, leaving the original as it was last saved", onclick: () => this.saveCopy() }),
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
      this.sightRow,
      el("h3", { className: "ob-edit", textContent: "add a piece" }),
      add,
      el("h3", { textContent: "pieces" }),
      handles,
      this.list,
      this.pieceBox,
      el("h3", { textContent: "palette" }),
      this.palette,
      (this.textParams = div("ob-texts")),
      el("h3", { textContent: "images (the collection's)" }),
      this.imageList,
      this.info,
      this.problems,
      footer,
    );
    this.dialog = el("dialog", { className: "ob" }, div("ob-main", div("ob-view", this.canvas, (this.hint = el("p", { className: "ob-hint", textContent: HINT }))), panel));
    document.body.append(this.dialog);
    // Escape asks before throwing changes away.
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      if (this.placing) return this.startPlacing(null);
      if (this.cutting) return this.endCut(false);
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
    if (this.cutting && (e.key === "Enter" || e.key === "Backspace")) {
      e.preventDefault();
      if (e.key === "Enter") return this.endCut(true);
      this.cutting.pop();
      return this.drawMarks();
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
      // Text names stay unique.
      const names = new Set(textsOf(object).map((t) => t.name));
      for (const text of copy.texts ?? []) {
        let n = 2;
        while (names.has(`${text.name} ${n}`)) n++;
        text.name = `${text.name} ${n}`;
        names.add(text.name);
      }
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
    this.placing = null;
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
    dropUnusedColors(object, this.wornImages());
    if (problems(object).length) return;
    this.onSave?.(object);
    this.close();
  }

  saveCopy() {
    const object = structuredClone(this.object);
    dropUnusedColors(object, this.wornImages());
    if (problems(object).length || !object.pieces.length) return;
    this.onSaveCopy?.(object);
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
    this.sight.checked = object.blocksSight !== false;
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
      this.refreshDecals(piece);
      this.refreshTexts(piece);
      this.refreshTile(piece);
      this.colorBox.replaceChildren(...this.colorChoices(piece));
    }

    this.refreshImages();
    this.refreshTextParams();
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

  // The picked piece's color: one of the palette's, a parameter's or not, or a new one.
  colorChoices(piece) {
    let param = 0;
    const swatches = this.object.palette.map((p, i) => {
      const title = p.param ? `${p.name ?? `parameter ${++param}`}: ${p.color}, set where it's placed` : p.color;
      const b = el("button", { type: "button", className: `ob-swatch${i === piece.color ? " active" : ""}${p.param ? " param" : ""}`, title });
      b.style.background = p.color;
      b.addEventListener("click", () => this.changePiece((x) => (x.color = i)));
      return b;
    });
    const fresh = el("input", { type: "color", value: NEW_COLOR, title: "a new color for this piece" });
    fresh.addEventListener("change", () => this.changePiece((p) => (p.color = addColor(this.object, fresh.value))));
    return [el("div", { className: "ob-swatches" }, ...swatches), fresh];
  }

  // --- images ---

  // The images the object's pieces wear.
  wornImages() {
    const ids = new Set(this.object.pieces.flatMap((p) => [...(p.decals ?? []).map((d) => d.image), p.tile?.image].filter(Boolean)));
    return this.images().filter((image) => ids.has(image.id));
  }

  // The palette for painting: each color with its ink and a label.
  paintPalette() {
    const colors = paletteColors(this.object);
    let param = 0;
    return this.object.palette.map((p, i) => ({ ink: PALETTE_INKS[i], color: colors[i], label: p.param ? (p.name ?? `parameter ${++param}`) : `color ${i + 1}` }));
  }

  // What shows under an image: the picked piece's color, or the first one.
  underlay() {
    const piece = this.object.pieces[this.picked] ?? this.object.pieces[0];
    return paletteColors(this.object)[piece?.color ?? 0] ?? "#808080";
  }

  // Paints an image of the collection, or a copy of a builtin one.
  paint(image, isNew = false) {
    if (this.readOnly) return;
    const own = image.builtin ? { ...structuredClone(image), id: newObjectId(), name: `${image.name} copy`, builtin: undefined } : image;
    this.painter.open(own, { palette: this.paintPalette(), underlay: this.underlay(), isNew: isNew || image.builtin });
  }

  // The collection's images, each a thumbnail to paint, then a button for a new one.
  refreshImages() {
    const colors = paletteColors(this.object);
    const underlay = this.underlay();
    this.imageList.replaceChildren(
      ...this.images().map((image) => {
        const canvas = el("canvas", { width: 48, height: 48 });
        drawImage(canvas, image, colors, underlay);
        return el("button", { type: "button", className: "ob-image", title: `${image.name} (${image.kind}${image.builtin ? ", builtin: painting makes a copy" : ""})`, onclick: () => this.paint(image) }, canvas, el("span", { textContent: image.name }));
      }),
      el("button", { type: "button", className: "ob-image ob-edit", textContent: "+ image", onclick: () => this.paint(emptyImage(), true) }),
    );
  }

  // `images` as swatch picker choices, drawn in `colors` over `underlay`.
  imageChoices(images, colors, underlay) {
    return images.map((image) => ({ value: image.id, label: image.name, draw: (canvas) => drawImage(canvas, image, colors, underlay) }));
  }

  // --- decals ---

  imageOf(id) {
    return this.images().find((image) => image.id === id);
  }

  // The picked piece's decals, each with its size, turn, and buttons to move or take it off; then
  // a choice of decal image to add, and what to do next while placing.
  refreshDecals(piece) {
    const colors = paletteColors(this.object);
    const underlay = this.underlay();
    const number = (value, step, title, set) => {
      const input = el("input", { type: "number", value: tidy(value), step, title });
      input.addEventListener("change", () => this.changePiece((p) => set(p, Number(input.value) || 0)));
      return input;
    };
    const rows = (piece.decals ?? []).map((decal, k) => {
      const image = this.imageOf(decal.image);
      const thumb = el("canvas", { width: 32, height: 32, title: image?.name ?? "a missing image" });
      if (image) drawImage(thumb, image, colors, underlay);
      const size = (axis) => number(decal.size[axis], 0.25, axis ? "height (ft)" : "width (ft)", (p, v) => (p.decals[k].size[axis] = Math.max(MIN_SIZE_FT, v)));
      const lost = !faceFrame(piece, decal.face);
      return el(
        "div",
        { className: `ob-decal${this.placing?.list === "decals" && this.placing.index === k ? " placing" : ""}`, title: lost ? "its face is gone: move it onto another" : "" },
        thumb,
        size(0),
        el("span", { textContent: "×" }),
        size(1),
        number(decal.turn, 15, "turn (°)", (p, v) => (p.decals[k].turn = v)),
        el("button", { type: "button", textContent: lost ? "lost: move" : "move", onclick: () => this.startPlacing({ list: "decals", index: k, image: decal.image }) }),
        el("button", { type: "button", textContent: "×", title: "take it off", onclick: () => this.changePiece((p) => (p.decals.splice(k, 1), p.decals.length || delete p.decals)) }),
      );
    });
    const choices = this.images().filter((image) => image.kind === "decal");
    const add = choices.length
      ? swatchPicker([{ value: "", label: "+ decal" }, ...this.imageChoices(choices, colors, underlay)], { title: "a decal image to put on this piece" })
      : el("p", { className: "ob-info", textContent: "no decal images yet" });
    add.addEventListener("change", () => add.value && this.startPlacing({ list: "decals", index: null, image: add.value }));
    const hint = this.placing?.list === "decals" ? el("p", { className: "ob-info", textContent: "click a flat face of this piece to put it there · esc stops" }) : null;
    this.decalList.replaceChildren(...rows, add, ...(hint ? [hint] : []));
  }

  // Placing hides the handles, so clicks reach the piece's faces.
  startPlacing(placing) {
    this.placing = placing;
    this.refresh();
  }

  // The picked piece's texts, each with its ink, size, turn, and buttons to move or take it off;
  // then a button for a new one.
  refreshTexts(piece) {
    const colors = paletteColors(this.object);
    const number = (value, step, title, set) => {
      const input = el("input", { type: "number", value: tidy(value), step, title });
      input.addEventListener("change", () => this.changePiece((p) => set(p, Number(input.value) || 0)));
      return input;
    };
    const inks = [...PALETTE_INKS.slice(0, this.object.palette.length), ...GRAY_INKS];
    const rows = (piece.texts ?? []).map((text, k) => {
      const ink = el("select", { title: "its ink" }, ...inks.map((i) => new Option(GRAY_INKS.includes(i) ? `gray ${i}` : `color ${PALETTE_INKS.indexOf(i) + 1}`, i)));
      ink.value = text.ink;
      ink.style.background = inkColor(text.ink, colors);
      ink.addEventListener("change", () => this.changePiece((p) => (p.texts[k].ink = ink.value)));
      const size = (axis) => number(text.size[axis], 0.25, axis ? "height (ft)" : "width (ft)", (p, v) => (p.texts[k].size[axis] = Math.max(MIN_SIZE_FT, v)));
      const lost = !faceFrame(piece, text.face);
      return el(
        "div",
        { className: `ob-decal ob-text${this.placing?.list === "texts" && this.placing.index === k ? " placing" : ""}`, title: lost ? "its face is gone: move it onto another" : "" },
        el("span", { className: "ob-text-name", textContent: text.name }),
        ink,
        size(0),
        el("span", { textContent: "×" }),
        size(1),
        number(text.turn, 15, "turn (°)", (p, v) => (p.texts[k].turn = v)),
        el("button", { type: "button", textContent: lost ? "lost: move" : "move", onclick: () => this.startPlacing({ list: "texts", index: k }) }),
        el("button", { type: "button", textContent: "×", title: "take it off", onclick: () => this.changePiece((p) => (p.texts.splice(k, 1), p.texts.length || delete p.texts)) }),
      );
    });
    const add = el("button", { type: "button", textContent: "+ text", title: "a sign a placement can fill in", onclick: () => this.startPlacing({ list: "texts", index: null }) });
    const hint = this.placing?.list === "texts" ? el("p", { className: "ob-info", textContent: "click a flat face of this piece to put it there · esc stops" }) : null;
    this.textList.replaceChildren(...rows, add, ...(hint ? [hint] : []));
  }

  // The object's texts: each one's name, and what it says unless a placement says otherwise.
  refreshTextParams() {
    const texts = textsOf(this.object);
    const rows = texts.map((text) => {
      const name = el("input", { type: "text", value: text.name, title: "its name, as placements see it" });
      name.addEventListener("change", () => {
        const wanted = name.value.trim();
        if (!wanted || texts.some((t) => t !== text && t.name === wanted)) return this.refreshPanel();
        this.change((o) => (findText(o, text.name).name = wanted));
      });
      const says = el("input", { type: "text", value: text.text, maxLength: MAX_TEXT, placeholder: TEXT_PLACEHOLDER, title: "what it says unless a placement says otherwise: capitals, digits, space and - . ! ?" });
      says.addEventListener("change", () => this.change((o) => (findText(o, text.name).text = signText(says.value))));
      return el("div", { className: "ob-text-param" }, name, says);
    });
    this.textParams.replaceChildren(...(rows.length ? [el("h3", { textContent: "texts" }), ...rows] : []));
  }

  // Puts the decal or text being placed where the click hit the picked piece, on the face it hit.
  placeDecal(hit) {
    const piece = this.object.pieces[this.picked];
    if (!hit || hit.object.userData.index !== this.picked || !piece) return;
    const face = faceIdOf(hit.face.normal);
    const at = faceSpot(piece, face, hit.object.worldToLocal(hit.point.clone()).toArray());
    const { list, index, image } = this.placing;
    this.placing = null;
    const names = new Set(textsOf(this.object).map((t) => t.name));
    let n = names.size + 1;
    while (names.has(`text ${n}`)) n++;
    this.changePiece((p) => {
      p[list] ??= [];
      const frame = faceFrame(p, face);
      // A new decal is a square nearly as big as fits the face; a new text a strip across it.
      const [w, h] = [frame.u.length(), frame.v.length()];
      const side = tidy(Math.max(MIN_SIZE_FT, 1.6 * Math.min(w, h)));
      const fresh = list === "texts" ? { name: `text ${n}`, text: "", ink: "7", size: [tidy(Math.max(MIN_SIZE_FT, 1.8 * w)), tidy(Math.max(MIN_SIZE_FT, Math.min(1.8 * h, 0.4 * w)))], turn: 0 } : { image, size: [side, side], turn: 0 };
      const decal = index !== null ? p[list][index] : fresh;
      // Kept on the face where it fits, so it doesn't hang off an edge.
      const inside = (n, half, extent) => (half >= extent ? 0.5 : Math.min(1 - half / extent / 2, Math.max(half / extent / 2, n)));
      Object.assign(decal, { face, at: [inside(at[0], decal.size[0] / 2, frame.u.length()), inside(at[1], decal.size[1] / 2, frame.v.length())].map((n) => Math.round(n * 1000) / 1000) });
      if (index === null) p[list].push(decal);
    });
  }

  // The picked piece's tiled image: which (or none), how wide each copy is and how much the copies'
  // brightness varies.
  refreshTile(piece) {
    const choices = this.images().filter((image) => image.kind === "tiled");
    const none = { value: "", label: choices.length ? "none" : "no tiled images yet" };
    // An image the piece's color shows through is tinted by it.
    const tintControl = (choice) => (choice.value && tintable(this.imageOf(choice.value)) ? el("div", { className: "ob-row" }, ...this.colorChoices(piece)) : null);
    const pick = swatchPicker([none, ...this.imageChoices(choices, paletteColors(this.object), this.underlay())], { value: piece.tile?.image ?? "", title: "an image to repeat over this piece", tintControl });
    pick.addEventListener("change", () => this.changePiece((p) => (pick.value ? (p.tile = { every: 1, jitter: 0, ...p.tile, image: pick.value }) : delete p.tile)));
    if (!piece.tile) return this.tileBox.replaceChildren(pick);
    const every = el("input", { type: "number", value: piece.tile.every, step: 0.25, min: MIN_SIZE_FT, title: "how wide each copy is (ft)" });
    every.addEventListener("change", () => this.changePiece((p) => (p.tile.every = Math.max(MIN_SIZE_FT, Number(every.value) || 1))));
    const jitter = el("input", { type: "range", min: 0, max: 1, step: 0.05, value: piece.tile.jitter, title: "how much each copy's brightness varies" });
    jitter.addEventListener("change", () => this.changePiece((p) => (p.tile.jitter = Number(jitter.value))));
    this.tileBox.replaceChildren(pick, el("div", { className: "ob-decal" }, el("span", { textContent: "every" }), every, el("span", { textContent: "ft · jitter" }), jitter));
  }

  // The object's decals, texts and tiled images, drawn as the game draws them.
  drawDecals() {
    for (const mesh of [...this.tiles.children]) {
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
      this.tiles.remove(mesh);
    }
    const colors = paletteColors(this.object);
    for (const { image, geometry } of tiledGeometries(this.object, (id) => this.imageOf(id))) this.tiles.add(new THREE.Mesh(geometry, tiledMaterial(tileTexture(image, colors))));
    this.decals.material.map?.dispose();
    this.decals.geometry.dispose();
    const decals = decalGeometry(this.object, (id) => this.imageOf(id));
    this.decals.geometry = decals?.geometry ?? new THREE.BufferGeometry();
    this.decals.material.map = decals ? atlasTexture(decals.atlas) : null;
    this.decals.material.needsUpdate = true;
    this.signs.material.map?.dispose();
    this.signs.geometry.dispose();
    const signs = textGeometry(this.object, [], {}, TEXT_PLACEHOLDER);
    this.signs.geometry = signs?.geometry ?? new THREE.BufferGeometry();
    this.signs.material.map = signs ? atlasTexture(signs.atlas) : null;
    this.signs.material.needsUpdate = true;
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
    this.decals = new THREE.Mesh(new THREE.BufferGeometry(), decalMaterial(null));
    this.signs = new THREE.Mesh(new THREE.BufferGeometry(), decalMaterial(null));
    this.tiles = new THREE.Group();
    this.scene.add(this.decals, this.signs, this.tiles);
    this.marks = new THREE.Group();
    this.scene.add(this.marks);

    this.orbit = new OrbitControls(this.camera, this.canvas);
    this.orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.orbit.screenSpacePanning = false;
    this.orbit.listenToKeyEvents(this.canvas);
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
      if (e.button !== 0 || (this.transform.axis && !this.placing)) return;
      const r = this.canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      const hit = ray.intersectObjects(this.pieces.children, false)[0];
      if (this.cutting) return this.addCutCorner(ray);
      if (this.placing) return this.placeDecal(hit);
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
    this.drawDecals();
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
    this.drawDecals();
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
      if (n === this.picked && !this.readOnly && !this.placing) this.transform.attach(mesh);
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

  // The footprint the game will use, on the ground, and the line of sight outline.
  drawMarks() {
    this.placePerson();
    for (const child of [...this.marks.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.marks.remove(child);
    }
    if (!this.object.pieces.length) return;
    this.drawHull();
    const { footprint } = shapeOf(this.object);
    if (footprint.circle !== undefined) this.marks.add(ring(footprint.circle, COLORS.footprint));
    else {
      const [w, d] = footprint.rect.map((v) => v / 2);
      const points = [[-w, -d], [w, -d], [w, d], [-w, d], [-w, -d]].map(([x, z]) => new THREE.Vector3(x, 0.03, z));
      this.marks.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: COLORS.footprint })));
    }
  }

  // The outline the game tests line of sight against, when asked for and the object blocks it, and
  // a hole being cut.
  drawHull() {
    // The hole being drawn, over everything.
    if (this.cutting?.length) {
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(this.cutting), new THREE.LineBasicMaterial({ color: COLORS.cut, depthTest: false }));
      line.renderOrder = 1;
      this.marks.add(line);
    }
    this.faceCount.textContent = "";
    const mesh = !this.hullBox.checked || this.object.blocksSight === false ? null : objectMesh(this.object);
    if (!mesh) return;
    const points = mesh.points.map((p) => new THREE.Vector3(...p));
    const edges = mesh.faces.flatMap((loop) => loop.flatMap((a, i) => [points[a], points[loop[(i + 1) % loop.length]]]));
    this.marks.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges), new THREE.LineBasicMaterial({ color: COLORS.sight, transparent: true, opacity: 0.8 })));
    // A faint skin, so holes show as holes.
    const skin = mesh.faces.flatMap((loop) => loop.slice(1, -1).flatMap((_, i) => [points[loop[0]], points[loop[i + 1]], points[loop[i + 2]]]));
    this.marks.add(new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(skin), new THREE.MeshBasicMaterial({ color: COLORS.sight, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false })));
    this.faceCount.textContent = `${mesh.faces.length} faces`;
  }

  // Cutting a hole through the sight outline: corners clicked on the plane across the view through
  // the object's middle, and when Enter ends it, a cone out from the camera through them.
  startCut() {
    if (this.readOnly || this.object.blocksSight === false) return;
    this.hullBox.checked = true;
    this.cutting = [];
    this.cutButton.classList.add("active");
    this.hint.textContent = "click the corners of the hole as you see the object · enter cuts it right through as you see it · backspace drops a corner · esc stops · right-drag still turns the view, shift-right-drag pans";
    this.canvas.focus();
    this.drawMarks();
  }

  addCutCorner(ray) {
    const view = this.camera.getWorldDirection(new THREE.Vector3());
    const middle = new THREE.Box3().setFromObject(this.pieces).getCenter(new THREE.Vector3());
    const at = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(view, middle), new THREE.Vector3());
    if (!at) return;
    this.cutting.push(at);
    this.cutFrom = this.camera.position.clone();
    this.drawMarks();
  }

  endCut(keep) {
    const corners = this.cutting;
    this.cutting = null;
    this.cutButton.classList.remove("active");
    this.hint.textContent = HINT;
    if (keep && corners.length >= 3) {
      const cut = { from: this.cutFrom.toArray().map((v) => tidy(v)), outline: corners.map((p) => p.toArray().map((v) => tidy(v))) };
      this.change((o) => (o.sightCuts = [...(o.sightCuts ?? []), cut]));
    } else this.drawMarks();
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

// The text named `name` on one of the object's pieces.
function findText(object, name) {
  return textsOf(object).find((t) => t.name === name);
}
