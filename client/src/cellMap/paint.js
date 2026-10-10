// Draws a scene (see scene.js) onto a 2D canvas context. Plain fills and
// strokes only - no filters, shadow blur or text - so it's quick on phones.

export const PALETTE = {
  meadow: "#b3c788",
  patchLight: "rgba(214, 226, 160, 0.22)",
  patchDark: "rgba(130, 160, 96, 0.14)",
  tuft: "#7f9b5a",
  shadow: "rgba(26, 38, 20, 0.32)",
  forest: "#34502f",
  crownDark: [78, 118, 64],
  crownLight: [96, 138, 72],
  highlight: "rgba(140, 180, 100, 0.55)",
  ink: "#1d2818",
};

// Line widths and the shadows' fall, in feet.
const CROWN_INK = 0.16;
const TUFT_INK = 0.1;
const SHADOW_OFFSET = {x: 0.3, y: 0.45};

export function paintScene(ctx, scene, pixelsPerFoot) {
  ctx.save();
  ctx.setTransform(pixelsPerFoot, 0, 0, pixelsPerFoot, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, scene.width, scene.height);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.fillStyle = PALETTE.meadow;
  ctx.fillRect(0, 0, scene.width, scene.height);
  for (const p of scene.patches) {
    ctx.fillStyle = p.light ? PALETTE.patchLight : PALETTE.patchDark;
    blob(ctx, p.x, p.y, p.radius, p.shape);
    ctx.fill();
  }
  paintTufts(ctx, scene.tufts);

  const cs = scene.cellSize;
  ctx.fillStyle = PALETTE.shadow;
  ctx.save();
  ctx.translate(SHADOW_OFFSET.x * cs, SHADOW_OFFSET.y * cs);
  loops(ctx, scene.forest);
  ctx.fill("evenodd");
  for (const c of scene.crowns) {
    blob(ctx, c.x, c.y, c.radius, c.shape);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = PALETTE.forest;
  loops(ctx, scene.forest);
  ctx.fill("evenodd");

  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = CROWN_INK;
  for (const c of scene.crowns) {
    ctx.fillStyle = mix(PALETTE.crownDark, PALETTE.crownLight, c.tone);
    blob(ctx, c.x, c.y, c.radius, c.shape);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.highlight;
    blob(ctx, c.x - c.radius * 0.22, c.y - c.radius * 0.25, c.radius * 0.5, c.highlight);
    ctx.fill();
  }
  ctx.restore();
}

function paintTufts(ctx, tufts) {
  ctx.strokeStyle = PALETTE.tuft;
  ctx.lineWidth = TUFT_INK;
  ctx.beginPath();
  for (const {x, y, size} of tufts) {
    for (const lean of [-0.6, 0, 0.6]) {
      ctx.moveTo(x + lean * size * 0.4, y);
      ctx.lineTo(x + lean * size, y - size * (lean ? 0.8 : 1));
    }
  }
  ctx.stroke();
}

function loops(ctx, rings) {
  ctx.beginPath();
  for (const ring of rings) {
    ctx.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
    ctx.closePath();
  }
}

// A lumpy circle, curved through the midpoints between its points.
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
  ctx.beginPath();
  ctx.moveTo(...mid(0));
  for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(...pts[i % n], ...mid(i));
  ctx.closePath();
}

function mix(a, b, t) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(", ")})`;
}
