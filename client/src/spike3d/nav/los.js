const STEP_FT = 1;
const CANOPY_FT = 22; // forest blocks sight from the ground up to here
const FOREST_SIGHT_FT = 45; // feet of full-density forest you can see through
const END_SKIP_FT = 1.5; // the viewers' own spots never block

// Whether eye point a can see point b ({x, y, z}, y up). Walks the line in
// 1ft steps: the ground, a structure (nav.occluder), or enough forest in
// the way blocks it. Returns {clear, reason, at}; at is where it was
// blocked.
export function lineOfSight(world, nav, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const steps = Math.ceil(len / STEP_FT);
  let forest = 0;
  for (let k = 1; k < steps; k++) {
    const dist = (k / steps) * len;
    if (dist < END_SKIP_FT || len - dist < END_SKIP_FT) continue;
    const t = k / steps;
    const x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
    const ground = world.heightAt(x, z);
    if (y < ground) return {clear: false, reason: "terrain", at: {x, y, z}};
    const sq = nav.squareAt(x, z);
    if (sq >= 0 && nav.occluder[sq] > y) return {clear: false, reason: "structure", at: {x, y, z}};
    if (y < ground + CANOPY_FT) {
      forest += (world.forest[world.cellAt(x, z)] / 255) * (len / steps);
      if (forest > FOREST_SIGHT_FT) return {clear: false, reason: "forest", at: {x, y, z}};
    }
  }
  return {clear: true, reason: null, at: null};
}

