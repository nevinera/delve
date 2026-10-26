// The editor's 2D map: open ocean with a tile grid, panned by dragging. Positions are continent
// tile units (x east, z south). Zoom isn't free: the map shows one of SCALES, the number of tiles
// across its wider side, and the wheel or C/V steps between them, keeping the point under the
// pointer (or the middle) in place.
//
// The current tool gets left-button presses first: tool.down(tile, event) returns true to take
// the drag, and then receives move(tile, event) and up(tile, event). Unclaimed left drags, right
// and middle drags, and space-drags pan. drawBase(ctx, mapView) paints under the grid and
// draw(ctx, mapView) on top of it. onView(mapView) hears about every pan, zoom and resize.

export const SCALES = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];
const OCEAN = "#1d3a52";
const GRID = "rgba(255, 255, 255, 0.08)";
const GRID_MAJOR = "rgba(255, 255, 255, 0.22)";
const MAJOR_EVERY = 8;
const KEY_PAN_PX = 500; // per second
const KEY_ZOOM_S = 0.18; // seconds per zoom step while C or V is held
const WHEEL_STEP = 100; // wheel delta per zoom step

export class MapView {
  constructor(canvas, { onPointer, drawBase, draw, tool, onView } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.view = { x: 0, z: 0, across: 32, scale: 24 }; // tile at the canvas center, tiles across, pixels per tile
    this.onPointer = onPointer;
    this.drawBase = drawBase;
    this.draw = draw;
    this.tool = tool;
    this.onView = onView;
    this.drag = null;
    this.spaceHeld = false;
    this.wheel = 0;
    this.keyZoom = 0;
    this.listen();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  // Centers the view on a box of tiles, at the closest scale that shows all of it.
  fit([x0, z0, x1, z1]) {
    this.view.x = (x0 + x1) / 2;
    this.view.z = (z0 + z1) / 2;
    const { width, height } = this.canvas;
    const wide = Math.max(width, height) || 1;
    const need = Math.max(((x1 - x0 + 2) * wide) / (width || 1), ((z1 - z0 + 2) * wide) / (height || 1));
    this.view.across = SCALES.find((s) => s >= need) ?? SCALES.at(-1);
    this.changed();
  }

  // Steps the scale by `steps` (positive zooms in), keeping screen point `at` over the same spot.
  zoom(steps, at = [this.canvas.width / 2, this.canvas.height / 2]) {
    const index = SCALES.indexOf(this.view.across);
    const next = SCALES[Math.max(0, Math.min(SCALES.length - 1, index - steps))];
    if (next === this.view.across) return;
    const before = this.toTile(...at);
    this.view.across = next;
    this.updateScale();
    const after = this.toTile(...at);
    this.view.x += before[0] - after[0];
    this.view.z += before[1] - after[1];
    this.changed();
  }

  toScreen([x, z]) {
    return screenFromTile(this.view, this.canvas, [x, z]);
  }

  toTile(sx, sy) {
    return tileFromScreen(this.view, this.canvas, [sx, sy]);
  }

  // The tiles in sight, as [x0, z0, x1, z1] in tile units.
  bounds() {
    const [x0, z0] = this.toTile(0, 0);
    const [x1, z1] = this.toTile(this.canvas.width, this.canvas.height);
    return [x0, z0, x1, z1];
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.changed();
  }

  updateScale() {
    this.view.scale = Math.max(this.canvas.width, this.canvas.height, 1) / this.view.across;
  }

  changed() {
    this.updateScale();
    this.render();
    this.onView?.(this);
  }

  // Keyboard navigation (keyNav.js): pans at a steady screen speed, and steps the zoom about the
  // middle while C or V is held.
  nudge(dt, { x, z, zoom }) {
    const pan = (KEY_PAN_PX * this.dpr * dt) / this.view.scale;
    this.view.x += x * pan;
    this.view.z += z * pan;
    // A step as soon as the key goes down, then one every KEY_ZOOM_S while it's held.
    this.keyZoom = zoom ? this.keyZoom - dt : 0;
    if (zoom && this.keyZoom <= 0) {
      this.keyZoom = KEY_ZOOM_S;
      this.zoom(zoom);
    }
    this.changed();
  }

  render() {
    const { ctx, canvas } = this;
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.drawBase?.(ctx, this);
    this.drawGrid();
    this.draw?.(ctx, this);
  }

  // Device pixels, for hit radii and line widths that should look the same at any zoom.
  get dpr() {
    return window.devicePixelRatio || 1;
  }

  drawGrid() {
    const { ctx, canvas, view } = this;
    const [x0, z0, x1, z1] = this.bounds();
    // Below a few pixels per tile, only every MAJOR_EVERY-th line is drawn.
    const step = view.scale < 6 ? MAJOR_EVERY : 1;
    const lines = (major) => {
      ctx.beginPath();
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
        if ((x % MAJOR_EVERY === 0) !== major) continue;
        const [sx] = this.toScreen([x, 0]);
        ctx.moveTo(Math.round(sx) + 0.5, 0);
        ctx.lineTo(Math.round(sx) + 0.5, canvas.height);
      }
      for (let z = Math.floor(z0 / step) * step; z <= z1; z += step) {
        if ((z % MAJOR_EVERY === 0) !== major) continue;
        const [, sy] = this.toScreen([0, z]);
        ctx.moveTo(0, Math.round(sy) + 0.5);
        ctx.lineTo(canvas.width, Math.round(sy) + 0.5);
      }
      ctx.stroke();
    };
    ctx.lineWidth = 1;
    ctx.strokeStyle = GRID;
    lines(false);
    ctx.strokeStyle = GRID_MAJOR;
    lines(true);
  }

  eventPos(e) {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
  }

  listen() {
    const { canvas } = this;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      if (e.key === " " && !e.target.matches("input, textarea, select")) this.spaceHeld = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.key === " ") this.spaceHeld = false;
    });

    canvas.addEventListener("pointerdown", (e) => {
      const [sx, sy] = this.eventPos(e);
      canvas.setPointerCapture(e.pointerId);
      const tool = this.tool?.();
      if (e.button === 0 && !this.spaceHeld && tool?.down?.(this.toTile(sx, sy), e)) {
        this.drag = { tool };
      } else {
        this.drag = { sx, sy, x: this.view.x, z: this.view.z };
      }
      this.render();
    });

    canvas.addEventListener("pointermove", (e) => {
      const pos = this.eventPos(e);
      const tile = this.toTile(...pos);
      this.pointer = tile;
      this.onPointer?.(tile);
      if (this.drag?.tool) {
        this.drag.tool.move?.(tile, e);
      } else if (this.drag) {
        this.view.x = this.drag.x - (pos[0] - this.drag.sx) / this.view.scale;
        this.view.z = this.drag.z - (pos[1] - this.drag.sy) / this.view.scale;
        this.changed();
        return;
      }
      this.render();
    });

    canvas.addEventListener("pointerup", (e) => {
      if (this.drag?.tool) this.drag.tool.up?.(this.toTile(...this.eventPos(e)), e);
      this.drag = null;
      this.render();
    });

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.wheel += e.deltaY;
        const steps = Math.trunc(this.wheel / WHEEL_STEP);
        if (!steps) return;
        this.wheel -= steps * WHEEL_STEP;
        this.zoom(-steps, this.eventPos(e));
      },
      { passive: false },
    );
  }
}

export function screenFromTile(view, size, [x, z]) {
  return [(x - view.x) * view.scale + size.width / 2, (z - view.z) * view.scale + size.height / 2];
}

export function tileFromScreen(view, size, [sx, sy]) {
  return [(sx - size.width / 2) / view.scale + view.x, (sy - size.height / 2) / view.scale + view.z];
}
