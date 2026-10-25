// The editor's 2D map: open ocean with a tile grid, panned by dragging and zoomed with the wheel.
// Positions are continent tile units (x east, z south).
//
// The current tool gets left-button presses first: tool.down(tile, event) returns true to take
// the drag, and then receives move(tile, event) and up(tile, event). Unclaimed left drags, right
// and middle drags, and space-drags pan. draw(ctx, mapView) paints on top of the grid.

const OCEAN = "#1d3a52";
const GRID = "rgba(255, 255, 255, 0.08)";
const GRID_MAJOR = "rgba(255, 255, 255, 0.22)";
const MAJOR_EVERY = 8;
const MIN_SCALE = 2;
const MAX_SCALE = 1600;

export class MapView {
  constructor(canvas, { onPointer, draw, tool } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.view = { x: 0, z: 0, scale: 24 }; // tile at the canvas center, pixels per tile
    this.onPointer = onPointer;
    this.draw = draw;
    this.tool = tool;
    this.drag = null;
    this.spaceHeld = false;
    this.listen();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  toScreen([x, z]) {
    return screenFromTile(this.view, this.canvas, [x, z]);
  }

  toTile(sx, sy) {
    return tileFromScreen(this.view, this.canvas, [sx, sy]);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.render();
  }

  render() {
    const { ctx, canvas } = this;
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.drawGrid();
    this.draw?.(ctx, this);
  }

  // Device pixels, for hit radii and line widths that should look the same at any zoom.
  get dpr() {
    return window.devicePixelRatio || 1;
  }

  drawGrid() {
    const { ctx, canvas, view } = this;
    const [x0, z0] = this.toTile(0, 0);
    const [x1, z1] = this.toTile(canvas.width, canvas.height);
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
        const pos = this.eventPos(e);
        const before = this.toTile(...pos);
        this.view.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.view.scale * Math.exp(-e.deltaY * 0.0015)));
        const after = this.toTile(...pos);
        this.view.x += before[0] - after[0];
        this.view.z += before[1] - after[1];
        this.render();
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
