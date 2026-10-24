import { CELL_FT, TILE_FT, TERRAIN, THEME } from "./constants.js";
import { fbm, smoothstep } from "./noise.js";

// The starting 3x3 world: temperate hills, a lake and a village up north,
// a road running north-south, and swamp across the southern row of tiles.
export const VILLAGE = {x: 768, z: 700, r: 90, h: 30};
export const GOBLIN_CAMP = {x: 820, z: 1270, r: 45, h: 19.5};
const LAKE = {x: 420, z: 420, r: 80, h: 4};

export const roadX = (z) => 768 + Math.sin(z / 170) * 110 + Math.sin(z / 61) * 18;

export function generateWorld(world) {
  const {w, h} = world;
  const water = world.waterLevel;
  for (let gz = 0; gz < h; gz++) {
    for (let gx = 0; gx < w; gx++) {
      const i = gz * w + gx;
      const x = (gx + 0.5) * CELL_FT;
      const z = (gz + 0.5) * CELL_FT;
      const swampBlend = smoothstep(2 * TILE_FT - 90, 2 * TILE_FT + 60, z);
      world.theme[i] = z >= 2 * TILE_FT ? THEME.swamp : THEME.temperate;

      let hills = 14 + fbm(x / 320, z / 320, 4, 1) * 52 + Math.pow(fbm(x / 140, z / 140, 3, 2), 3) * 70;
      hills = flattenToward(hills, x, z, LAKE, 1.4);
      hills = flattenToward(hills, x, z, VILLAGE, 1.8);
      const bog = water - 4 + fbm(x / 70, z / 70, 3, 3) * 8.5;
      let height = hills * (1 - swampBlend) + bog * swampBlend;
      height = flattenToward(height, x, z, GOBLIN_CAMP, 1.6);
      const roadDist = Math.abs(x - roadX(z));
      height += (height < water + 1 ? water + 1 - height : 0) * smoothstep(14, 6, roadDist) * (1 - swampBlend * 0.5);
      world.height[i] = Math.max(0, height);

      const forest = smoothstep(0.48, 0.66, fbm(x / 210, z / 210, 3, 5));
      const swampForest = smoothstep(0.35, 0.75, fbm(x / 120, z / 120, 3, 6)) * 0.7;
      let f = forest * (1 - swampBlend) + swampForest * swampBlend;
      f *= smoothstep(VILLAGE.r, VILLAGE.r + 50, Math.hypot(x - VILLAGE.x, z - VILLAGE.z));
      f *= smoothstep(GOBLIN_CAMP.r, GOBLIN_CAMP.r + 30, Math.hypot(x - GOBLIN_CAMP.x, z - GOBLIN_CAMP.z));
      f *= smoothstep(8, 20, roadDist);
      world.forest[i] = Math.round(f * 255);
    }
  }

  for (let gz = 0; gz < h; gz++) {
    for (let gx = 0; gx < w; gx++) {
      const i = gz * w + gx;
      const x = (gx + 0.5) * CELL_FT;
      const z = (gz + 0.5) * CELL_FT;
      world.terrain[i] = pickTerrain(world, gx, gz, x, z);
      if (world.terrain[i] === TERRAIN.rock || world.terrain[i] === TERRAIN.road) world.forest[i] = 0;
    }
  }

  world.objects = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    const x = VILLAGE.x + Math.cos(a) * 52;
    const z = VILLAGE.z + Math.sin(a) * 52;
    if (Math.abs(x - roadX(z)) < 20) continue;
    world.objects.push({type: "hut", x, z, rot: -a - Math.PI / 2});
  }
  world.objects.push({type: "hut", x: GOBLIN_CAMP.x - 18, z: GOBLIN_CAMP.z + 8, rot: 0.6});
  world.objects.push({type: "hut", x: GOBLIN_CAMP.x + 20, z: GOBLIN_CAMP.z - 6, rot: 2.4});
  world.refreshThemeField();
}

function flattenToward(height, x, z, spot, falloff) {
  const d = Math.hypot(x - spot.x, z - spot.z);
  const t = smoothstep(spot.r * falloff, spot.r * 0.6, d);
  return height + (spot.h - height) * t;
}

function pickTerrain(world, gx, gz, x, z) {
  const i = gz * world.w + gx;
  const height = world.height[i];
  const water = world.waterLevel;
  const swamp = world.theme[i] === THEME.swamp;
  const roadDist = Math.abs(x - roadX(z));
  const dx = world.height[world.index(gx + 1, gz)] - world.height[world.index(gx - 1, gz)];
  const dz = world.height[world.index(gx, gz + 1)] - world.height[world.index(gx, gz - 1)];
  const slope = Math.hypot(dx, dz) / (2 * CELL_FT);
  const n = fbm(x / 60, z / 60, 3, 9);

  if (roadDist < 7 && height > water - 0.5) return TERRAIN.road;
  if (swamp) {
    if (height < water + 1.5) return TERRAIN.mud;
    return n > 0.4 ? TERRAIN.moss : n > 0.3 ? TERRAIN.mud : TERRAIN.grass;
  }
  if (slope > 0.75 || height > 72) return TERRAIN.rock;
  if (height < water + 1.6) return TERRAIN.sand;
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r * 0.75 && n > 0.45) return TERRAIN.dirt;
  return n > 0.66 ? TERRAIN.dirt : TERRAIN.grass;
}
