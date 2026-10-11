// Draws a scene (see scene.js) onto a 2D canvas context: fills for the
// ground and forest, and decorations stamped from sprites (see sprites.js).
// No filters, shadow blur or text, so it's quick on phones.

export function paintScene(ctx, scene, pixelsPerFoot, style, sprites) {
  const {palette} = style;
  ctx.save();
  ctx.setTransform(pixelsPerFoot, 0, 0, pixelsPerFoot, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, scene.width, scene.height);
  ctx.clip();

  ctx.fillStyle = palette.meadow;
  ctx.fillRect(0, 0, scene.width, scene.height);
  for (const {terrain, loops: rings} of scene.grounds) {
    ctx.fillStyle = palette[terrain];
    loops(ctx, rings);
    ctx.fill("evenodd");
  }
  stamp(ctx, scene.patches, sprites.patches);
  stamp(ctx, scene.pools, sprites.pools);
  stamp(ctx, scene.tufts, sprites.tufts);
  stamp(ctx, scene.reeds, sprites.reeds);
  stamp(ctx, scene.tallTufts, sprites.tallTufts);

  const cs = scene.cellSize;
  ctx.fillStyle = palette.shadow;
  ctx.save();
  ctx.translate(style.shadowOffset.x * cs, style.shadowOffset.y * cs);
  loops(ctx, scene.forest);
  ctx.fill("evenodd");
  ctx.restore();

  ctx.fillStyle = palette.forest;
  loops(ctx, scene.forest);
  ctx.fill("evenodd");

  // Over the forest's mass, which they cut through, and under the crowns
  // lining them.
  paintTrails(ctx, scene.trails, style);
  stamp(ctx, scene.crowns, sprites.crowns);
  ctx.restore();
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

// Each trail is stroked twice, wide and dark then narrower and light, so it
// gets an edge.
function paintTrails(ctx, trails, style) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const [color, extra] of [[style.palette.trailEdge, style.trailEdge * 2], [style.palette.trail, 0]]) {
    ctx.strokeStyle = color;
    for (const {width, points} of trails) {
      ctx.lineWidth = width + extra;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }
}

function loops(ctx, rings) {
  ctx.beginPath();
  for (const ring of rings) {
    ctx.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
    ctx.closePath();
  }
}
