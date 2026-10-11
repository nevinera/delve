// Draws each of a style's decoration variants once, into its own small
// canvas, so the painter can stamp thousands of them with drawImage instead
// of tracing every path again.
import {crownShape, patchShape, poolShape, reedShape, tallTuftShape, tuftShape} from "./style";

// Sprites are drawn at the largest size the scene places them (in cell
// sizes), so stamping only ever scales them down.
export const MAX_SIZE = {crowns: 1.05, patches: 2.4, tufts: 0.5, tallTufts: 0.55, pools: 0.65, reeds: 0.45};

// Each sprite is {canvas, extent}: extent is half the canvas's width, in
// feet, when drawn at the MAX_SIZE radius.
export function buildSprites(style, cellSize, pixelsPerFoot, createCanvas) {
  const make = (kind, count, extentFor, draw) =>
    Array.from({length: count}, (_, i) => {
      const radius = MAX_SIZE[kind] * cellSize;
      const extent = extentFor(radius);
      const size = Math.max(1, Math.ceil(2 * extent * pixelsPerFoot));
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(pixelsPerFoot, 0, 0, pixelsPerFoot, extent * pixelsPerFoot, extent * pixelsPerFoot);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      draw(ctx, i, radius);
      return {canvas, extent, radius};
    });

  const {palette} = style;
  const shadow = {x: style.shadowOffset.x * cellSize, y: style.shadowOffset.y * cellSize};
  return {
    crowns: make("crowns", style.variants.crowns, (r) => r + Math.hypot(shadow.x, shadow.y) + style.crownInk, (ctx, i, r) => {
      const {tone, lobes: shape} = crownShape(style, i);
      ctx.fillStyle = palette.shadow;
      ctx.beginPath();
      lobes(ctx, shape, r, shadow.x, shadow.y, 1);
      ctx.fill();
      // Stroked thick then filled, so only the cluster's outline shows.
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = style.crownInk * 2;
      ctx.beginPath();
      lobes(ctx, shape, r, 0, 0, 1);
      ctx.stroke();
      ctx.fillStyle = mix(palette.crownDark, palette.crownLight, tone);
      ctx.fill();
      ctx.fillStyle = palette.highlight;
      ctx.beginPath();
      lobes(ctx, shape, r, 0, 0, 0.5, -0.3);
      ctx.fill();
    }),
    patches: make("patches", style.variants.patches, (r) => r * 1.2, (ctx, i, r) => {
      const {light, shape} = patchShape(style, i);
      ctx.fillStyle = light ? palette.patchLight : palette.patchDark;
      ctx.beginPath();
      blob(ctx, 0, 0, r, shape);
      ctx.fill();
    }),
    tufts: make("tufts", style.variants.tufts, (r) => r * 1.2 + style.tuftInk, (ctx, i, r) => {
      ctx.strokeStyle = palette.tuft;
      ctx.lineWidth = style.tuftInk;
      ctx.beginPath();
      for (const t of tuftShape(style, i)) {
        const x = t.x * r * 0.6;
        const y = t.y * r * 0.6 + t.size * r * 0.5;
        const size = t.size * r;
        for (const lean of [-0.6, 0, 0.6]) {
          ctx.moveTo(x + lean * size * 0.4, y);
          ctx.lineTo(x + lean * size, y - size * (lean ? 0.8 : 1));
        }
      }
      ctx.stroke();
    }),
    tallTufts: make("tallTufts", style.variants.tallTufts, (r) => r * 1.3 + style.tuftInk, (ctx, i, r) => {
      ctx.lineWidth = style.tuftInk * 1.3;
      for (const light of [false, true]) {
        ctx.strokeStyle = light ? palette.tallTuftLight : palette.tallTuft;
        ctx.beginPath();
        for (const blade of tallTuftShape(style, i).filter((b) => b.light === light)) {
          const x = blade.x * r;
          const y = blade.y * r + r * 0.5;
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + blade.lean * r * 0.3, y - blade.size * r * 0.6, x + blade.lean * r, y - blade.size * r);
        }
        ctx.stroke();
      }
    }),
    pools: make("pools", style.variants.pools, (r) => r * 1.3 + style.tuftInk, (ctx, i, r) => {
      const shape = poolShape(style, i);
      ctx.fillStyle = palette.pool;
      ctx.beginPath();
      blob(ctx, 0, 0, r, shape);
      ctx.fill();
      ctx.strokeStyle = palette.poolRim;
      ctx.lineWidth = style.tuftInk;
      ctx.beginPath();
      blob(ctx, -r * 0.08, -r * 0.1, r * 0.75, shape);
      ctx.stroke();
    }),
    reeds: make("reeds", style.variants.reeds, (r) => r * 1.2 + style.tuftInk, (ctx, i, r) => {
      ctx.strokeStyle = palette.reed;
      ctx.lineWidth = style.tuftInk * 1.2;
      ctx.beginPath();
      for (const reed of reedShape(style, i)) {
        ctx.moveTo(0, r * 0.5);
        ctx.lineTo(reed.lean * r, r * 0.5 - reed.size * r);
      }
      ctx.stroke();
    }),
  };
}

// Adds a crown's lobes to the current path: at radius r, offset by (ox, oy),
// each lobe scaled by size and nudged up and left by shift of its radius.
function lobes(ctx, shape, r, ox, oy, size, shift = 0) {
  for (const lobe of shape) {
    blob(ctx, ox + (lobe.dx + lobe.r * shift) * r, oy + (lobe.dy + lobe.r * shift) * r, lobe.r * r * size, lobe.shape);
  }
}

// Adds a lumpy circle to the current path, curved through the midpoints
// between its points.
function blob(ctx, x, y, radius, shape) {
  const n = shape.length;
  const pts = shape.map((k, i) => {
    const a = (i / n) * Math.PI * 2;
    return [x + Math.cos(a) * radius * k, y + Math.sin(a) * radius * k];
  });
  const mid = (i) => {
    const [ax, ay] = pts[i % n];
    const [bx, by] = pts[(i + 1) % n];
    return [(ax + bx) / 2, (ay + by) / 2];
  };
  ctx.moveTo(...mid(0));
  for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(...pts[i % n], ...mid(i));
  ctx.closePath();
}

function mix(a, b, t) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(", ")})`;
}
