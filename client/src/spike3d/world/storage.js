import { encodeTile, decodeTile } from "./tileCodec.js";

const KEY = "spike3d:tiles:v1";

// Spike-only persistence: every tile's bytes, base64'd into one
// localStorage entry.
export function saveWorld(world) {
  const tiles = {};
  for (let ty = 0; ty < world.rows; ty++) {
    for (let tx = 0; tx < world.cols; tx++) tiles[`${tx},${ty}`] = toBase64(encodeTile(world, tx, ty));
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(tiles));
    return true;
  } catch {
    return false;
  }
}

export function loadWorld(world) {
  let tiles;
  try {
    tiles = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return false;
  }
  if (!tiles) return false;
  world.objects = [];
  for (const b64 of Object.values(tiles)) decodeTile(world, fromBase64(b64));
  world.refreshThemeField();
  return true;
}

export function clearSavedWorld() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing saved to clear
  }
}

function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
