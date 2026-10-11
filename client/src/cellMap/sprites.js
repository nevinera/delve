// Draws each of a style's decoration variants once, into its own small
// canvas, so the painter can stamp thousands of them with drawImage instead
// of tracing every path again.
// Which shape each kind of decoration takes is the style's (see style.js).
import {crownShape, hatchShape, leafShape, patchShape, pineShape, reedShape, stoneShape, tallTuftShape, tuftShape, twigShape} from "./style";

// Sprites are drawn at the largest size the scene places them (in cell
// sizes), so stamping only ever scales them down.
export const MAX_SIZE = {crowns: 1.05, patches: 2.4, tufts: 0.5, tallTufts: 0.55, reeds: 0.45, hatches: 0.7};

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
    crowns: make("crowns", style.forest.crowns ? style.variants.crowns : 0, (r) => r + Math.hypot(shadow.x, shadow.y) + style.crownInk, (ctx, i, r) => {
      if (style.forest.crowns === "pine") return drawPine(ctx, style, i, r, shadow);
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
      ctx.fillStyle = crownColor(palette, i, tone);
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
      const kind = style.meadow.tuft;
      if (kind === "leaves") return drawLeaves(ctx, style, i, r);
      if (kind === "twigs") return drawTwigs(ctx, style, i, r);
      if (kind === "pebbles") return drawStones(ctx, style, stoneShape(style, i, {min: 1, extra: 2, kind: 10}), r * 0.7);
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
      if (style.tallGrass.clump === "rubble") return drawStones(ctx, style, stoneShape(style, i, {min: 4, extra: 3, kind: 11}), r * 0.8);
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
    hatches: make("hatches", style.forest.mass === "rock" ? style.variants.hatches : 0, (r) => r * 1.2 + style.tuftInk, (ctx, i, r) => {
      const {angle, strokes} = hatchShape(style, i);
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      ctx.strokeStyle = palette.hatch;
      ctx.lineWidth = style.tuftInk * 1.3;
      ctx.beginPath();
      for (const {offset, length} of strokes) {
        const [cx, cy] = [-sin * offset * r, cos * offset * r];
        ctx.moveTo(cx - cos * length * r * 0.5, cy - sin * length * r * 0.5);
        ctx.lineTo(cx + cos * length * r * 0.5, cy + sin * length * r * 0.5);
      }
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

// A crown's color: variant i's pair of the palette's crown tones, mixed.
function crownColor(palette, i, tone) {
  const tones = palette.crownTones;
  const [dark, light] = tones[i % tones.length];
  return mix(dark, light, tone);
}

// A pine: its star of boughs inked and shadowed like a crown, the inner
// star lighter, then dabs of snow (or light) toward the top left.
function drawPine(ctx, style, i, r, shadow) {
  const {palette} = style;
  const {tone, turn, outer, inner, dabs} = pineShape(style, i);
  const star = (shape, radius, ox, oy, rotate) => {
    const n = shape.length;
    shape.forEach((k, j) => {
      const a = turn + rotate + (j / n) * Math.PI * 2;
      const [x, y] = [ox + Math.cos(a) * radius * k, oy + Math.sin(a) * radius * k];
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  ctx.fillStyle = palette.shadow;
  ctx.beginPath();
  star(outer, r, shadow.x, shadow.y, 0);
  ctx.fill();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = style.crownInk * 2;
  ctx.beginPath();
  star(outer, r, 0, 0, 0);
  ctx.stroke();
  const [dark, light] = palette.crownTones[i % palette.crownTones.length];
  ctx.fillStyle = mix(dark, light, tone * 0.5);
  ctx.fill();
  ctx.fillStyle = mix(dark, light, 0.5 + tone * 0.5);
  ctx.beginPath();
  star(inner, r * 0.62, 0, 0, Math.PI / outer.length);
  ctx.fill();
  ctx.fillStyle = palette.highlight;
  ctx.beginPath();
  for (const dab of dabs) {
    ctx.moveTo((dab.x + dab.r) * r, dab.y * r);
    ctx.arc(dab.x * r, dab.y * r, dab.r * r, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawLeaves(ctx, style, i, r) {
  const {leaves} = style.palette;
  for (const leaf of leafShape(style, i)) {
    ctx.fillStyle = leaves[Math.floor(leaf.color * leaves.length)];
    ctx.beginPath();
    ctx.ellipse(leaf.x * r * 0.6, leaf.y * r * 0.6, leaf.size * r, leaf.size * r * 0.5, leaf.angle, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTwigs(ctx, style, i, r) {
  ctx.strokeStyle = style.palette.tuft;
  ctx.lineWidth = style.tuftInk;
  ctx.beginPath();
  for (const twig of twigShape(style, i)) {
    const [x, y] = [twig.x * r * 0.6, twig.y * r * 0.6 + twig.size * r * 0.4];
    const [tx, ty] = [x + twig.lean * twig.size * r * 0.5, y - twig.size * r];
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    if (twig.fork) {
      const [mx, my] = [(x + tx) / 2, (y + ty) / 2];
      ctx.moveTo(mx, my);
      ctx.lineTo(mx - twig.lean * twig.size * r * 0.4 + twig.size * r * 0.2, my - twig.size * r * 0.35);
    }
  }
  ctx.stroke();
}

// Stones: each a lumpy blob, inked, lighter or darker.
function drawStones(ctx, style, stones, r) {
  const {palette} = style;
  for (const stone of stones) {
    ctx.beginPath();
    blob(ctx, stone.x * r, stone.y * r, stone.size * r * 1.6, stone.shape);
    ctx.fillStyle = stone.light ? palette.tallTuftLight : palette.tallTuft;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = style.tuftInk * 0.8;
    ctx.stroke();
  }
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
export function blob(ctx, x, y, radius, shape) {
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
