// Draws a scene (see scene.js) onto a 2D canvas context: fills for the
// ground and forest, and decorations stamped from sprites (see sprites.js).
// No filters, shadow blur or text, so it's quick on phones.
import {DEFAULT_PATH, PATHS, hummockShape} from "./style";
import {blob} from "./sprites";

// canopyCtx (optional) takes the tree crowns instead, on their own
// transparent layer, so what's drawn between (decoration stamps) sits
// under the trees.
export function paintScene(ctx, scene, pixelsPerFoot, style, sprites, {canopyCtx = null} = {}) {
  const {palette} = style;
  ctx.save();
  ctx.setTransform(pixelsPerFoot, 0, 0, pixelsPerFoot, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, scene.width, scene.height);
  ctx.clip();

  ctx.fillStyle = palette.meadow;
  ctx.fillRect(0, 0, scene.width, scene.height);
  for (const {terrain, loops: rings} of scene.grounds) {
    if (terrain === "marsh") {
      paintMarsh(ctx, rings, scene.marshWater, scene.hummocks, style);
      continue;
    }
    ctx.fillStyle = palette[terrain];
    loops(ctx, rings);
    ctx.fill("evenodd");
  }
  stamp(ctx, scene.patches, sprites.patches);

  const cs = scene.cellSize;
  if (style.forest.mass === "rock") paintRock(ctx, scene, style, sprites);
  else {
    ctx.fillStyle = palette.shadow;
    ctx.save();
    ctx.translate(style.shadowOffset.x * cs, style.shadowOffset.y * cs);
    loops(ctx, scene.forest);
    ctx.fill("evenodd");
    ctx.restore();

    ctx.fillStyle = palette.forest;
    loops(ctx, scene.forest);
    ctx.fill("evenodd");
  }

  // Trails go over the ground and the forest's mass, which they cut
  // through, and under the decorations and water, which they don't cross.
  paintTrails(ctx, scene.trails, style);
  paintWater(ctx, scene, style);
  paintBridges(ctx, scene.bridges, style, cs);
  stamp(ctx, scene.tufts, sprites.tufts);
  stamp(ctx, scene.reeds, sprites.reeds);
  stamp(ctx, scene.tallTufts, sprites.tallTufts);
  if (canopyCtx) {
    canopyCtx.save();
    canopyCtx.setTransform(pixelsPerFoot, 0, 0, pixelsPerFoot, 0, 0);
    stamp(canopyCtx, scene.crowns, sprites.crowns);
    canopyCtx.restore();
  } else {
    stamp(ctx, scene.crowns, sprites.crowns);
  }
  ctx.restore();
}

// Rock, like a hand-drawn cave map: a dark mass, hatched along its edge
// (only inside it), with a heavy inked line around it.
function paintRock(ctx, scene, style, sprites) {
  const {palette} = style;
  ctx.fillStyle = palette.shadow;
  ctx.save();
  ctx.translate(style.shadowOffset.x * scene.cellSize * 0.4, style.shadowOffset.y * scene.cellSize * 0.4);
  loops(ctx, scene.forest);
  ctx.fill("evenodd");
  ctx.restore();
  ctx.fillStyle = palette.forest;
  loops(ctx, scene.forest);
  ctx.fill("evenodd");
  ctx.save();
  loops(ctx, scene.forest);
  ctx.clip("evenodd");
  stamp(ctx, scene.hatches, sprites.hatches);
  ctx.restore();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = style.crownInk * 3;
  ctx.lineJoin = "round";
  loops(ctx, scene.forest);
  ctx.stroke();
}

// Marsh: ground inside its edge, and shallow water inside that, with
// hummocks rising out of it. Hummocks are traced in the rim color first,
// a little wider, so they get a pale edge where they meet the water and
// merge where they touch each other.
function paintMarsh(ctx, rings, water, hummocks, style) {
  const {palette} = style;
  const rim = style.tuftInk;
  ctx.fillStyle = palette.marsh;
  loops(ctx, rings);
  ctx.fill("evenodd");
  ctx.save();
  loops(ctx, water);
  ctx.clip("evenodd");
  ctx.fillStyle = palette.pool;
  loops(ctx, water);
  ctx.fill("evenodd");
  ctx.lineJoin = "round";
  ctx.strokeStyle = palette.poolRim;
  ctx.lineWidth = rim * 2;
  loops(ctx, water);
  ctx.stroke();
  ctx.beginPath();
  for (const {x, y, radius, variant} of hummocks) blob(ctx, x, y, radius, hummockShape(style, variant));
  ctx.stroke();
  ctx.fillStyle = palette.marsh;
  ctx.fill();
  ctx.restore();
}

// Water, darker away from its shore, with a pale line along the shore - or
// a jagged rim of ice.
function paintWater(ctx, scene, style) {
  if (!scene.water.length) return;
  const {palette} = style;
  ctx.fillStyle = palette.water;
  loops(ctx, scene.water);
  ctx.fill("evenodd");
  ctx.fillStyle = palette.waterDeep;
  loops(ctx, scene.deepWater);
  ctx.fill("evenodd");
  if (scene.ice.length) {
    ctx.fillStyle = palette.ice;
    loops(ctx, [...scene.water, ...scene.ice]);
    ctx.fill("evenodd");
    ctx.strokeStyle = palette.iceEdge;
    ctx.lineWidth = style.tuftInk;
    ctx.lineJoin = "miter";
    loops(ctx, scene.ice);
    ctx.stroke();
    return;
  }
  ctx.strokeStyle = palette.waterRim;
  ctx.lineWidth = style.tuftInk * 1.5;
  ctx.lineJoin = "round";
  loops(ctx, scene.water);
  ctx.stroke();
}

// A wooden deck: a shadow on the water, planks across, a beam down each
// side, and an inked edge.
const PLANK = 0.9; // feet
const BEAM = 0.55; // feet

export function paintBridges(ctx, bridges, style, cellSize) {
  const {palette} = style;
  for (const {a, b, halfWidth} of bridges) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
    ctx.fillStyle = palette.shadow;
    ctx.fillRect(style.shadowOffset.x * cellSize * 0.5, -halfWidth + style.shadowOffset.y * cellSize * 0.5, length, halfWidth * 2);
    ctx.fillStyle = palette.bridge;
    ctx.fillRect(0, -halfWidth, length, halfWidth * 2);
    ctx.strokeStyle = palette.bridgeEdge;
    ctx.lineWidth = style.tuftInk;
    ctx.beginPath();
    for (let x = PLANK; x < length; x += PLANK) {
      ctx.moveTo(x, -halfWidth + BEAM);
      ctx.lineTo(x, halfWidth - BEAM);
    }
    ctx.stroke();
    ctx.fillStyle = palette.bridgeBeam;
    ctx.fillRect(0, -halfWidth, length, BEAM);
    ctx.fillRect(0, halfWidth - BEAM, length, BEAM);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = style.crownInk;
    ctx.strokeRect(0, -halfWidth, length, halfWidth * 2);
    ctx.restore();
  }
}

// Each placement is {x, y, radius, variant}; its sprite is scaled down
// from the radius it was drawn at.
function stamp(ctx, placements, sprites) {
  for (const {x, y, radius, variant} of placements) {
    const sprite = sprites[variant];
    const half = sprite.extent * (radius / sprite.radius);
    ctx.drawImage(sprite.canvas, x - half, y - half, half * 2, half * 2);
  }
}

// Each trail's solid part is stroked twice, wide and dark then narrower and
// light, so it gets an edge. Its fading ends are outlines that spread as
// they go, filled with the same colors fading out. Its look is its path
// type's (see style.js's PATHS): colors, edge, and a road's ruts.
// Narrower trails go first, so wider ones run over where they meet;
// trails as wide as each other are drawn together, so they merge.
const FADE_SPREAD = 0.7;

function paintTrails(ctx, trails, style) {
  const widths = [...new Set(trails.map((t) => t.width))].sort((a, b) => a - b);
  for (const width of widths) paintTrailGroup(ctx, trails.filter((t) => t.width === width), style);
}

function paintTrailGroup(ctx, trails, style) {
  const {palette} = style;
  const pathOf = (trail) => PATHS[trail.type] ?? PATHS[DEFAULT_PATH];
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  for (const pass of ["edge", "fill"]) {
    for (const trail of trails) {
      const path = pathOf(trail);
      const {width, body, fades, caps} = trail;
      const [color, extra, fadeTo] = pass === "edge" ? [palette[path.edgeColor], path.edge * 2, 0.3] : [palette[path.color], 0, 1];
      if (pass === "edge" && !path.edge) continue;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width + extra;
      if (body.length > 1) {
        ctx.beginPath();
        ctx.moveTo(body[0].x, body[0].y);
        for (const p of body.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.beginPath();
      for (const {x, y} of caps) {
        ctx.moveTo(x + (width + extra) / 2, y);
        ctx.arc(x, y, (width + extra) / 2, 0, Math.PI * 2);
      }
      ctx.fill();
      for (const line of fades) {
        // Starts a little back over the solid part, so there's no seam.
        const [a, b] = line;
        const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const fade = [{x: a.x - ((b.x - a.x) / l) * width * 0.3, y: a.y - ((b.y - a.y) / l) * width * 0.3}, ...line];
        const start = line[0];
        const end = fade[fade.length - 1];
        const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
        gradient.addColorStop(0, withAlpha(color, 1));
        gradient.addColorStop(fadeTo * 0.4, withAlpha(color, 0.85));
        gradient.addColorStop(fadeTo, withAlpha(color, 0));
        ctx.fillStyle = gradient;
        spreadingOutline(ctx, fade, width, extra);
        ctx.fill();
      }
    }
  }
  // A road's ruts: two darker lines along its solid part.
  ctx.strokeStyle = palette.roadRut;
  for (const {width, body} of trails.filter((t) => pathOf(t).ruts && t.body.length > 1)) {
    ctx.lineWidth = width * 0.08;
    ctx.beginPath();
    for (const side of [-0.24, 0.24]) {
      const line = offsetLine(body, width * side);
      ctx.moveTo(line[0].x, line[0].y);
      for (const p of line.slice(1)) ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  for (const trail of trails) {
    ctx.fillStyle = withAlpha(palette[pathOf(trail).color], 0.7);
    ctx.beginPath();
    for (const {x, y, radius} of trail.spots) {
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

// A line moved sideways by distance (to its left on screen, when negative).
function offsetLine(points, distance) {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return {x: p.x - ((b.y - a.y) / l) * distance, y: p.y + ((b.x - a.x) / l) * distance};
  });
}

// The outline of a line whose width grows by FADE_SPREAD along it.
function spreadingOutline(ctx, points, width, extra) {
  const total = points.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0), 0) || 1;
  const left = [];
  const right = [];
  let walked = 0;
  points.forEach((p, i) => {
    if (i) walked += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const half = (width * (1 + FADE_SPREAD * (walked / total)) + extra) / 2;
    left.push({x: p.x - ((b.y - a.y) / l) * half, y: p.y + ((b.x - a.x) / l) * half});
    right.push({x: p.x + ((b.y - a.y) / l) * half, y: p.y - ((b.x - a.x) / l) * half});
  });
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of [...left.slice(1), ...right.reverse()]) ctx.lineTo(p.x, p.y);
  ctx.closePath();
}

// A "#rrggbb" color with an alpha.
function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function loops(ctx, rings) {
  ctx.beginPath();
  for (const ring of rings) {
    ctx.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
    ctx.closePath();
  }
}
