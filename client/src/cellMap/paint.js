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
  paintTrails(ctx, scene.trails, style);

  ctx.fillStyle = palette.shadow;
  ctx.save();
  ctx.translate(style.shadowOffset.x * cs, style.shadowOffset.y * cs);
  loops(ctx, scene.forest);
  ctx.fill("evenodd");
  ctx.restore();

  ctx.fillStyle = palette.forest;
  loops(ctx, scene.forest);
  ctx.fill("evenodd");

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

// Trails are filled, with a darker edge.
function paintTrails(ctx, trails, style) {
  ctx.lineJoin = "round";
  loops(ctx, trails);
  ctx.fillStyle = style.palette.trail;
  ctx.fill("evenodd");
  ctx.strokeStyle = style.palette.trailEdge;
  ctx.lineWidth = style.trailEdge;
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
