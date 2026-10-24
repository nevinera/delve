import { CELL_FT, MAX_HEIGHT, TERRAIN, THEME } from "../world/constants.js";

// Brushes edit the world's tags in place and return the cell rect they
// touched (or null). Strength-based ones scale by dt so a held brush works
// the same at any frame rate.
export const BRUSHES = {
  raise: {label: "Raise", kind: "height"},
  lower: {label: "Lower", kind: "height"},
  smooth: {label: "Smooth", kind: "height"},
  flatten: {label: "Flatten", kind: "height"},
  ...Object.fromEntries(Object.keys(TERRAIN).map((name) => [name, {label: cap(name), kind: "terrain"}])),
  forest: {label: "Forest +", kind: "forest"},
  clear: {label: "Forest −", kind: "forest"},
  swamp: {label: "Swamp", kind: "theme"},
  temperate: {label: "Temperate", kind: "theme"},
  hut: {label: "Hut", kind: "object"},
  removeHut: {label: "Hut −", kind: "object"},
  los: {label: "LOS probe", kind: "probe"},
};

const RAISE_FT_PER_S = 18;

export function applyBrush(world, name, x, z, radius, dt, opts = {}) {
  const brush = BRUSHES[name];
  if (!brush) return null;
  if (brush.kind === "object") return applyObjectBrush(world, name, x, z, radius, opts);
  if (brush.kind === "probe") return null;

  const rect = cellRect(world, x, z, radius);
  const smoothSrc = name === "smooth" ? world.height.slice() : null;
  for (let gz = rect.z0; gz <= rect.z1; gz++) {
    for (let gx = rect.x0; gx <= rect.x1; gx++) {
      const d = Math.hypot((gx + 0.5) * CELL_FT - x, (gz + 0.5) * CELL_FT - z);
      if (d > radius) continue;
      const fall = 1 - (d / radius) ** 2;
      const i = gz * world.w + gx;
      switch (name) {
        case "raise":
        case "lower": {
          const delta = RAISE_FT_PER_S * dt * fall * (name === "raise" ? 1 : -1);
          world.height[i] = clamp(world.height[i] + delta, 0, MAX_HEIGHT);
          break;
        }
        case "smooth": {
          let sum = 0;
          for (let k = -1; k <= 1; k++) for (let m = -1; m <= 1; m++) sum += smoothSrc[world.index(gx + m, gz + k)];
          world.height[i] += (sum / 9 - world.height[i]) * Math.min(1, 6 * dt * fall);
          break;
        }
        case "flatten":
          world.height[i] += ((opts.target ?? world.height[i]) - world.height[i]) * Math.min(1, 6 * dt * fall);
          break;
        case "forest":
        case "clear":
          world.forest[i] = clamp(world.forest[i] + (name === "forest" ? 1 : -1) * 500 * dt * fall, 0, 255);
          break;
        case "swamp":
        case "temperate":
          world.theme[i] = THEME[name];
          break;
        default:
          world.terrain[i] = TERRAIN[name];
          if (name === "road" || name === "rock") world.forest[i] = 0;
      }
    }
  }
  if (brush.kind === "theme") world.refreshThemeField();
  return {rect, layers: [brush.kind]};
}

function applyObjectBrush(world, name, x, z, radius, opts) {
  if (name === "hut") {
    if (world.objects.some((o) => Math.hypot(o.x - x, o.z - z) < 20)) return null;
    world.objects.push({type: "hut", x, z, rot: opts.rot ?? 0});
  } else {
    const before = world.objects.length;
    world.objects = world.objects.filter((o) => Math.hypot(o.x - x, o.z - z) > Math.max(radius, 10));
    if (world.objects.length === before) return null;
  }
  return {rect: cellRect(world, x, z, 16), layers: ["object"]};
}

function cellRect(world, x, z, radius) {
  return {
    x0: Math.max(0, Math.floor((x - radius) / CELL_FT)),
    z0: Math.max(0, Math.floor((z - radius) / CELL_FT)),
    x1: Math.min(world.w - 1, Math.floor((x + radius) / CELL_FT)),
    z1: Math.min(world.h - 1, Math.floor((z + radius) / CELL_FT)),
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}
