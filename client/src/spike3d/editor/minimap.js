import { CELL_FT, TILE_CELLS, TILE_FT, TERRAIN, THEME } from "../world/constants.js";

const SCALE = 3; // canvas px per cell
const COLORS = {
  [TERRAIN.grass]: [96, 140, 60],
  [TERRAIN.dirt]: [130, 100, 68],
  [TERRAIN.sand]: [200, 184, 136],
  [TERRAIN.rock]: [128, 124, 118],
  [TERRAIN.road]: [168, 146, 108],
  [TERRAIN.mud]: [86, 70, 48],
  [TERRAIN.moss]: [92, 116, 50],
};
const FLASH_MS = 700;

// A 2D painting view of one tile: terrain hill-shaded, water, forest,
// swamp, huts, the player, and a flash over terrain chunks as they rebuild.
export class Minimap {
  constructor(world, canvas) {
    this.world = world;
    this.canvas = canvas;
    canvas.width = canvas.height = TILE_CELLS * SCALE;
    this.ctx = canvas.getContext("2d");
    this.base = document.createElement("canvas");
    this.base.width = this.base.height = TILE_CELLS;
    this.tile = {x: 1, y: 1};
    this.flashes = [];
    this.stale = true;
  }

  setTile(tx, ty) {
    this.tile = {x: tx, y: ty};
    this.stale = true;
  }

  flash(rects) {
    const now = performance.now();
    for (const r of rects) this.flashes.push({...r, at: now});
  }

  // Canvas pixel -> world feet.
  toWorld(px, py) {
    return {x: this.tile.x * TILE_FT + (px / SCALE) * CELL_FT, z: this.tile.y * TILE_FT + (py / SCALE) * CELL_FT};
  }

  redrawBase() {
    const {world} = this;
    const ctx = this.base.getContext("2d");
    const img = ctx.createImageData(TILE_CELLS, TILE_CELLS);
    const ox = this.tile.x * TILE_CELLS, oz = this.tile.y * TILE_CELLS;
    for (let z = 0; z < TILE_CELLS; z++) {
      for (let x = 0; x < TILE_CELLS; x++) {
        const i = world.index(ox + x, oz + z);
        const h = world.height[i];
        const shade = 1 + (world.height[world.index(ox + x - 1, oz + z - 1)] - h) * 0.06;
        let c = COLORS[world.terrain[i]].map((v) => v * Math.max(0.5, Math.min(1.4, shade)));
        if (world.theme[i] === THEME.swamp) c = [c[0] * 0.85, c[1] * 0.9, c[2] * 0.65];
        const forest = world.forest[i] / 255;
        c = c.map((v, k) => v * (1 - forest * 0.55) + [30, 70, 34][k] * forest * 0.55);
        const depth = world.waterLevel - h;
        if (depth > 0) {
          const water = world.theme[i] === THEME.swamp ? [60, 70, 40] : [40, 100, 140];
          const t = Math.min(0.9, 0.45 + depth / 10);
          c = c.map((v, k) => v * (1 - t) + water[k] * t);
        }
        img.data.set([c[0], c[1], c[2], 255], (z * TILE_CELLS + x) * 4);
      }
    }
    ctx.putImageData(img, 0, 0);
    this.stale = false;
  }

  draw(units, brush) {
    if (this.stale) this.redrawBase();
    const {ctx, canvas, world} = this;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0, canvas.width, canvas.height);
    const toPx = (x, z) => [((x - this.tile.x * TILE_FT) / CELL_FT) * SCALE, ((z - this.tile.y * TILE_FT) / CELL_FT) * SCALE];

    ctx.fillStyle = "#c58a3c";
    ctx.strokeStyle = "#2a1a0a";
    for (const o of world.objects) {
      const [px, py] = toPx(o.x, o.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-o.rot);
      ctx.fillRect(-6, -4.5, 12, 9);
      ctx.strokeRect(-6, -4.5, 12, 9);
      ctx.restore();
    }
    for (const u of units) {
      const [px, py] = toPx(u.x, u.z);
      ctx.fillStyle = u.kind === "player" ? "#fff" : u.state === "chase" ? "#ff4040" : "#ffb040";
      ctx.beginPath();
      ctx.arc(px, py, u.kind === "player" ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (brush) {
      const [px, py] = toPx(brush.x, brush.z);
      ctx.strokeStyle = "#fff";
      ctx.beginPath();
      ctx.arc(px, py, (brush.radius / CELL_FT) * SCALE, 0, Math.PI * 2);
      ctx.stroke();
    }
    const now = performance.now();
    this.flashes = this.flashes.filter((f) => now - f.at < FLASH_MS);
    for (const f of this.flashes) {
      const a = 1 - (now - f.at) / FLASH_MS;
      const [x0, y0] = toPx(f.x0 * CELL_FT, f.z0 * CELL_FT);
      const [x1, y1] = toPx((f.x1 + 1) * CELL_FT, (f.z1 + 1) * CELL_FT);
      ctx.fillStyle = `rgba(255, 230, 80, ${a * 0.25})`;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = `rgba(255, 230, 80, ${a})`;
      ctx.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
    }
  }
}
