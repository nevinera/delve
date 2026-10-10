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
  stamp(ctx, scene.patches, sprites.patches);
  stamp(ctx, scene.tufts, sprites.tufts);

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

function loops(ctx, rings) {
  ctx.beginPath();
  for (const ring of rings) {
    ctx.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
    ctx.closePath();
  }
}
