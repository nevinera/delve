import { GRAY_INKS, IMAGE_KINDS, IMAGE_PX, OPACITIES, PALETTE_INKS, emptyImage, imageRgba, inkColor, pixelAt, setPixel } from "../world/builtObjects.js";

// The image painter: a dialog over the object builder for painting one of a collection's images
// (world/builtObjects.js) pixel by pixel. Inks are the object's palette colors and eight grays,
// each at one of four opacities; under the pixels shows the piece's color, as it will on the
// piece. Left-drag paints with the tool (pen, fill or eraser), right-drag erases. A tiled image
// shows repeated beside it.

const CELL_PX = 12; // screen pixels per image pixel
const TILE_PREVIEW = 3; // a tiled image's preview repeats it this many times each way
const UNDO_KEEP = 100;
const TOOLS = ["pen", "fill", "eraser"];
const KEYS = { b: "pen", g: "fill", e: "eraser" };

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

// Draws an image over `underlay` into a 2D canvas, scaled to fit it.
export function drawImage(canvas, image, colors, underlay) {
  const g = canvas.getContext("2d");
  const pixels = new ImageData(imageRgba(image, colors), IMAGE_PX, IMAGE_PX);
  const scratch = Object.assign(document.createElement("canvas"), { width: IMAGE_PX, height: IMAGE_PX });
  scratch.getContext("2d").putImageData(pixels, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = underlay;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(scratch, 0, 0, canvas.width, canvas.height);
}

export class ImagePainter {
  // onSave(image) hears a saved image, onDelete(image) asks for one to go.
  constructor({ onSave, onDelete }) {
    this.onSave = onSave;
    this.onDelete = onDelete;
    this.tool = "pen";
    this.ink = "7";
    this.opacity = "4";
    this.buildDom();
  }

  // Opens on a copy of `image`, or a new one. colors: [{ ink, color, label }] for the object's
  // palette; underlay: the color under the pixels.
  open(image, { palette = [], underlay = "#808080", isNew = false } = {}) {
    this.image = structuredClone(image ?? emptyImage());
    this.saved = JSON.stringify(this.image);
    this.palette = palette;
    this.colors = palette.map((p) => p.color);
    this.underlay = underlay;
    this.undos = [];
    this.redos = [];
    this.deleteButton.hidden = isNew;
    if (!PALETTE_INKS.slice(0, palette.length).includes(this.ink) && !GRAY_INKS.includes(this.ink)) this.ink = "7";
    this.dialog.showModal();
    this.refresh();
  }

  close() {
    this.dialog.close();
  }

  buildDom() {
    const div = (cls, ...c) => el("div", { className: cls }, ...c);
    this.canvas = el("canvas", { className: "ip-canvas", width: IMAGE_PX * CELL_PX, height: IMAGE_PX * CELL_PX });
    this.tiles = el("canvas", { className: "ip-tiles", width: IMAGE_PX * TILE_PREVIEW * 3, height: IMAGE_PX * TILE_PREVIEW * 3 });
    this.name = el("input", { type: "text", placeholder: "name" });
    this.name.addEventListener("change", () => (this.image.name = this.name.value.trim() || "unnamed"));
    this.kind = el("select", { onchange: () => ((this.image.kind = this.kind.value), this.refresh()) });
    for (const kind of IMAGE_KINDS) this.kind.add(new Option(kind === "decal" ? "decal: stuck on one face" : "tiled: repeated over a piece", kind));
    this.inks = div("ip-inks");
    this.opacities = div("ob-row", ...OPACITIES.map((o) => el("button", { type: "button", textContent: `${(Number(o) / OPACITIES.length) * 100}%`, onclick: () => ((this.opacity = o), this.refresh()) })));
    this.toolButtons = TOOLS.map((tool) => el("button", { type: "button", textContent: tool, onclick: () => ((this.tool = tool), this.refresh()) }));
    this.deleteButton = el("button", { type: "button", textContent: "delete", onclick: () => this.onDelete?.(this.image) });
    const panel = div(
      "ob-panel ip-panel",
      this.name,
      el("label", { className: "ob-field" }, "kind", this.kind),
      el("h3", { textContent: "ink" }),
      this.inks,
      el("h3", { textContent: "opacity" }),
      this.opacities,
      el("h3", { textContent: "tool" }),
      div("ob-row", ...this.toolButtons, el("button", { type: "button", textContent: "clear", onclick: () => this.change(() => (this.image.rows = emptyImage().rows)) })),
      this.tiles,
      el("p", { className: "ob-info", textContent: "left-drag paints · right-drag erases · B pen, G fill, E eraser · ctrl-z undoes, ctrl-shift-z redoes" }),
      div(
        "ob-row ob-footer",
        el("button", { type: "button", textContent: "undo", onclick: () => this.undo() }),
        el("button", { type: "button", textContent: "redo", onclick: () => this.redo() }),
        this.deleteButton,
        el("span", { className: "ob-spacer" }),
        el("button", { type: "button", textContent: "cancel", onclick: () => this.cancel() }),
        el("button", { type: "button", textContent: "save", onclick: () => this.save() }),
      ),
    );
    this.dialog = el("dialog", { className: "ob ip" }, div("ob-main", div("ip-view", this.canvas), panel));
    document.body.append(this.dialog);
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.cancel();
    });
    this.dialog.addEventListener("keydown", (e) => {
      e.stopPropagation();
      this.onKey(e);
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.stroke = { from: JSON.stringify(this.image), erase: e.button === 2 };
      this.paintAt(e);
    });
    this.canvas.addEventListener("pointermove", (e) => this.stroke && this.paintAt(e));
    this.canvas.addEventListener("pointerup", () => {
      if (this.stroke && this.stroke.from !== JSON.stringify(this.image)) this.pushUndo(this.stroke.from);
      this.stroke = null;
    });
  }

  onKey(e) {
    if (e.target.matches("input, select, textarea")) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "z") e.shiftKey ? this.redo() : this.undo();
    else if (!ctrl && KEYS[e.key.toLowerCase()]) this.tool = KEYS[e.key.toLowerCase()];
    else return;
    e.preventDefault();
    this.refresh();
  }

  // The pixel under the pointer gets the tool.
  paintAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * IMAGE_PX);
    const y = Math.floor(((e.clientY - r.top) / r.height) * IMAGE_PX);
    if (x < 0 || y < 0 || x >= IMAGE_PX || y >= IMAGE_PX) return;
    const pixel = this.stroke.erase || this.tool === "eraser" ? null : { ink: this.ink, opacity: this.opacity };
    if (this.tool === "fill" && !this.stroke.erase) fill(this.image, x, y, pixel);
    else setPixel(this.image, x, y, pixel);
    this.draw();
  }

  change(fn) {
    const before = JSON.stringify(this.image);
    fn();
    if (JSON.stringify(this.image) !== before) this.pushUndo(before);
    this.refresh();
  }

  pushUndo(before) {
    this.undos.push(before);
    if (this.undos.length > UNDO_KEEP) this.undos.shift();
    this.redos = [];
  }

  undo() {
    this.replay(this.undos, this.redos);
  }

  redo() {
    this.replay(this.redos, this.undos);
  }

  replay(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(this.image));
    this.image = JSON.parse(from.pop());
    this.refresh();
  }

  save() {
    this.image.name = this.name.value.trim() || "unnamed";
    this.onSave?.(structuredClone(this.image));
    this.close();
  }

  cancel() {
    if (JSON.stringify(this.image) !== this.saved && !window.confirm("Throw away the changes to this image?")) return;
    this.close();
  }

  refresh() {
    this.name.value = this.image.name;
    this.kind.value = this.image.kind;
    const swatch = (ink, color, label) => {
      const b = el("button", { type: "button", className: `ob-swatch${ink === this.ink ? " active" : ""}`, title: label, onclick: () => ((this.ink = ink), this.refresh()) });
      b.style.background = color;
      return b;
    };
    this.inks.replaceChildren(
      el("div", { className: "ob-row" }, ...this.palette.map((p) => swatch(p.ink, p.color, p.label))),
      el("div", { className: "ob-row" }, ...GRAY_INKS.map((ink) => swatch(ink, inkColor(ink, []), `gray ${ink}`))),
    );
    this.opacities.querySelectorAll("button").forEach((b, i) => b.classList.toggle("active", OPACITIES[i] === this.opacity));
    for (const b of this.toolButtons) b.classList.toggle("active", b.textContent === this.tool);
    this.tiles.hidden = this.image.kind !== "tiled";
    this.draw();
  }

  draw() {
    drawImage(this.canvas, this.image, this.colors, this.underlay);
    // Faint lines between pixels.
    const g = this.canvas.getContext("2d");
    g.strokeStyle = "rgba(0, 0, 0, 0.15)";
    g.beginPath();
    for (let i = 1; i < IMAGE_PX; i++) {
      g.moveTo(i * CELL_PX + 0.5, 0);
      g.lineTo(i * CELL_PX + 0.5, this.canvas.height);
      g.moveTo(0, i * CELL_PX + 0.5);
      g.lineTo(this.canvas.width, i * CELL_PX + 0.5);
    }
    g.stroke();
    if (this.image.kind !== "tiled") return;
    const one = Object.assign(document.createElement("canvas"), { width: IMAGE_PX * 3, height: IMAGE_PX * 3 });
    drawImage(one, this.image, this.colors, this.underlay);
    const t = this.tiles.getContext("2d");
    for (let i = 0; i < TILE_PREVIEW; i++) for (let j = 0; j < TILE_PREVIEW; j++) t.drawImage(one, i * one.width, j * one.height);
  }
}

// Fills the run of same pixels joined to (x, y) with `pixel`.
function fill(image, x, y, pixel) {
  const key = (p) => (p ? p.ink + p.opacity : "..");
  const was = key(pixelAt(image, x, y));
  if (was === key(pixel)) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [i, j] = stack.pop();
    if (i < 0 || j < 0 || i >= IMAGE_PX || j >= IMAGE_PX || key(pixelAt(image, i, j)) !== was) continue;
    setPixel(image, i, j, pixel);
    stack.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
  }
}
