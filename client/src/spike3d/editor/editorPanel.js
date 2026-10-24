import { Minimap } from "./minimap.js";
import { BRUSHES } from "./brushes.js";

// The edit-mode bottom sheet: tile picker, minimap (paintable), brush
// buttons, brush size, and the paint/camera toggle.
export class EditorPanel {
  constructor(root, app) {
    this.app = app;
    this.el = document.createElement("div");
    this.el.className = "s3-panel";

    this.tiles = document.createElement("div");
    this.tiles.className = "s3-tiles";
    this.tileBtns = [];
    for (let ty = 0; ty < app.world.rows; ty++) {
      for (let tx = 0; tx < app.world.cols; tx++) {
        const b = btn(`${tx},${ty}`, () => this.selectTile(tx, ty));
        this.tileBtns.push({b, tx, ty});
        this.tiles.append(b);
      }
    }

    const canvas = document.createElement("canvas");
    this.minimap = new Minimap(app.world, canvas);
    this.bindMinimap(canvas);

    const tools = document.createElement("div");
    tools.className = "s3-tools";
    this.paintBtn = btn("🖌 Paint", () => {
      app.paintMode = !app.paintMode;
      this.paintBtn.textContent = app.paintMode ? "🖌 Paint" : "✋ Camera";
      app.applyControlScheme();
    });
    const brushes = document.createElement("div");
    brushes.className = "s3-brushes";
    this.brushBtns = {};
    for (const [name, brush] of Object.entries(BRUSHES)) {
      const b = btn(brush.label, () => this.selectBrush(name));
      this.brushBtns[name] = b;
      brushes.append(b);
    }
    const size = document.createElement("label");
    const slider = document.createElement("input");
    Object.assign(slider, {type: "range", min: 4, max: 64, step: 2, value: app.brush.radius});
    const sizeText = document.createElement("span");
    sizeText.textContent = `${app.brush.radius} ft`;
    slider.addEventListener("input", () => {
      app.brush.radius = Number(slider.value);
      sizeText.textContent = `${slider.value} ft`;
    });
    size.append("Size", slider, sizeText);
    const row = document.createElement("div");
    row.className = "s3-brushes";
    this.note = document.createElement("span");
    this.note.className = "s3-note";
    row.append(this.paintBtn, this.note);
    tools.append(row, brushes, size);

    this.el.append(this.tiles, canvas, tools);
    root.append(this.el);
    this.selectBrush(app.brush.name);
  }

  setVisible(visible) {
    this.el.classList.toggle("hidden", !visible);
  }

  selectTile(tx, ty) {
    this.minimap.setTile(tx, ty);
    for (const {b, tx: x, ty: y} of this.tileBtns) b.classList.toggle("on", x === tx && y === ty);
  }

  selectBrush(name) {
    this.app.brush.name = name;
    for (const [n, b] of Object.entries(this.brushBtns)) b.classList.toggle("on", n === name);
  }

  bindMinimap(canvas) {
    const app = this.app;
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      const p = this.minimap.toWorld(((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height);
      app.brush.x = p.x;
      app.brush.z = p.z;
    };
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      at(e);
      if (app.brushPaints()) app.startStroke();
      else if (app.brush.name === "los") app.probe = {x: app.brush.x, y: 0, z: app.brush.z};
      else app.paint(app.brush.x, app.brush.z, 0, {rot: 0});
    });
    canvas.addEventListener("pointermove", (e) => at(e));
    const end = () => (app.brush.active = false);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  draw(units, brush) {
    this.minimap.draw(units, brush);
  }
}

function btn(label, onClick) {
  const b = document.createElement("button");
  b.className = "s3-btn";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}
