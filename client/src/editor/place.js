// Where you were in each world, kept in this browser's localStorage so reopening a world puts you
// back there: { continent, step, tool, map, detailWindow, cameras }. It isn't part of the world, so
// it's never saved or published with it.

const KEY = "delve3d-editor-places";
const KEEP = 20; // worlds remembered, the most recently left kept

// The name a world's place is kept under: the repo it's opened from, else its own name.
export function placeKey(world, source) {
  return source?.repo ? `repo:${source.repo.toLowerCase()}` : `name:${world.info.name}`;
}

export function loadPlace(key) {
  return readAll()[key] ?? null;
}

export function savePlace(key, place) {
  const others = Object.entries(readAll())
    .filter(([k]) => k !== key)
    .sort(([, a], [, b]) => b.at - a.at);
  const kept = [[key, { ...place, at: Date.now() }], ...others].slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage that's full or turned off just means the place isn't remembered.
  }
}

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

// A camera and what it orbits, as continent feet: { position, target }, for a view whose scene is
// `origin` ([x, z] continent feet) away from the continent's.
export function cameraPlace(camera, controls, origin = [0, 0]) {
  const out = (v) => [v.x + origin[0], v.y, v.z + origin[1]].map((n) => Math.round(n * 100) / 100);
  return { position: out(camera.position), target: out(controls.target) };
}

// Puts a camera back where cameraPlace found it.
export function placeCamera({ position, target }, camera, controls, origin = [0, 0]) {
  camera.position.set(position[0] - origin[0], position[1], position[2] - origin[1]);
  controls.target.set(target[0] - origin[0], target[1], target[2] - origin[1]);
  controls.update();
}
