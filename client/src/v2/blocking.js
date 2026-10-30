// What stands in the way of walking: trees' trunks and objects' footprints (world/objects.js), as
// shapes on the ground, and pushing a walker of some radius out of them, so they slide round them.
// The game server enforces the same; clients use it so walking looks right.
//
// A shape is { circle: [x, z, r] }, { capsule: [ax, az, bx, bz, r] } or { rect: [x, z, yaw, hw, hd] },
// continent feet, a rect's half width along its own x and half depth along its own z.

// The shape a tree { x, z } with a trunk `r` ft round stands in the way with.
export const treeShape = ({ x, z }, r) => ({ circle: [x, z, r] });

// The shape an object stands in the way with, or null for one that doesn't (an open footprint).
// An object's own x points at (cos yaw, -sin yaw).
export function objectShape({ at: [x, z], yaw, footprint }) {
  if (footprint.circle) return { circle: [x, z, footprint.circle] };
  const [c, s] = [Math.cos(yaw), -Math.sin(yaw)];
  if (footprint.capsule) {
    const [r, half] = footprint.capsule;
    return { capsule: [x - c * half, z - s * half, x + c * half, z + s * half, r] };
  }
  if (footprint.rect) return { rect: [x, z, yaw, footprint.rect[0] / 2, footprint.rect[1] / 2] };
  return null;
}

// The nearest point of `shape`'s edge or inside to (x, z), and how far in from it its edge is
// (its radius, 0 for a rect).
function nearestOf(shape, x, z) {
  if (shape.circle) {
    const [cx, cz, r] = shape.circle;
    return [cx, cz, r];
  }
  if (shape.capsule) {
    const [ax, az, bx, bz, r] = shape.capsule;
    const [dx, dz] = [bx - ax, bz - az];
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return [ax + dx * t, az + dz * t, r];
  }
  const [cx, cz, yaw, hw, hd] = shape.rect;
  const [c, s] = [Math.cos(yaw), -Math.sin(yaw)];
  // Into the rect's own axes, clamped to it, and back.
  const [u, v] = [(x - cx) * c + (z - cz) * s, -(x - cx) * s + (z - cz) * c];
  const [cu, cv] = [Math.max(-hw, Math.min(hw, u)), Math.max(-hd, Math.min(hd, v))];
  return [cx + cu * c - cv * s, cz + cu * s + cv * c, 0];
}

// (x, z) moved out of `shapes` far enough for a walker `radius` ft round, [x, z].
export function pushOut(x, z, radius, shapes) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const shape of shapes) {
      const [nx, nz, r] = nearestOf(shape, x, z);
      const [dx, dz] = [x - nx, z - nz];
      const d = Math.hypot(dx, dz);
      const room = r + radius;
      if (d >= room) continue;
      if (d > 1e-6) {
        [x, z] = [nx + (dx / d) * room, nz + (dz / d) * room];
      } else if (shape.rect) {
        // Inside a rect: out its nearest side.
        const [cx, cz, yaw, hw, hd] = shape.rect;
        const [c, s] = [Math.cos(yaw), -Math.sin(yaw)];
        let [u, v] = [(x - cx) * c + (z - cz) * s, -(x - cx) * s + (z - cz) * c];
        if (hw - Math.abs(u) < hd - Math.abs(v)) u = (u < 0 ? -1 : 1) * (hw + radius);
        else v = (v < 0 ? -1 : 1) * (hd + radius);
        [x, z] = [cx + u * c - v * s, cz + u * s + v * c];
      } else {
        // On its middle line: out any way.
        [x, z] = [nx + room, nz];
      }
      moved = true;
    }
    if (!moved) break;
  }
  return [x, z];
}
