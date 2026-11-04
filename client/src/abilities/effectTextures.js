import * as THREE from "three";
import { strFromU8 } from "fflate";
import { EFFECT_IMAGE_PATH as EFFECT_IMAGE_NAME, EFFECT_SHEET_PATH, effectImagePath } from "../world/paths.js";
import stock from "./stockTextures.json";

// The grayscale textures effects tint and pick by name. Each is a cell of a sheet: the stock sheet in
// public/effects, or one of the world's own (.agents/formats.md), whose names win over stock ones.

export const STOCK_SHEET = { url: "/effects/stock.png", columns: stock.columns, rows: stock.rows, textures: stock.textures };

let worldSheets = [];
let worldRepeating = new Map(); // name -> bytes

const isCount = (n) => Number.isInteger(n) && n > 0;

// What a world's sheet file says, or null if it isn't a sheet.
export function readEffectSheet(text) {
  try {
    const { columns, rows, textures } = JSON.parse(text);
    const fits = isCount(columns) && isCount(rows) && Array.isArray(textures) && textures.length <= columns * rows;
    return fits && textures.every((name) => typeof name === "string") ? { columns, rows, textures } : null;
  } catch {
    return null;
  }
}

// A world's sheets, from its files: [path, bytes] pairs.
export function setWorldEffectSheets(files) {
  const all = new Map(files);
  worldSheets = [];
  worldRepeating = new Map();
  for (const [path, bytes] of all) {
    // An image with no list of cells is one repeating texture.
    const picture = EFFECT_IMAGE_NAME.exec(path)?.[1];
    if (picture && bytes && !all.has(`effects/${picture}.json`)) worldRepeating.set(picture, bytes);
    const name = EFFECT_SHEET_PATH.exec(path)?.[1];
    const image = name && all.get(effectImagePath(name));
    const sheet = image && bytes ? readEffectSheet(strFromU8(bytes)) : null;
    if (sheet) worldSheets.push({ ...sheet, bytes: image });
    else if (name) console.warn(`The effect sheet ${path} can't be read, or has no image.`);
  }
}

export const effectSheets = () => [...worldSheets, STOCK_SHEET];

// Every texture's name, the world's first.
export function textureNames() {
  return [...new Set(effectSheets().flatMap((sheet) => sheet.textures))];
}

// Where a texture is: its sheet, and the column and row counting from the top left. A name that
// isn't one is the stock dot, so a world missing a sheet still shows its effects.
export function textureCell(name) {
  for (const sheet of effectSheets()) {
    const cell = sheet.textures.indexOf(name);
    if (cell >= 0) return { sheet, column: cell % sheet.columns, row: Math.floor(cell / sheet.columns) };
  }
  return textureCell("dot");
}

// Every repeating texture's name, the world's first.
export function repeatingNames() {
  return [...new Set([...worldRepeating.keys(), ...stock.repeating])];
}

const loaded = new WeakMap();

// Starts an image on its way into a texture, its bottom row first, so its up is up.
function loadInto(texture, bytes, url) {
  if (typeof createImageBitmap !== "function") return;
  const blob = bytes ? Promise.resolve(new Blob([bytes], { type: "image/png" })) : fetch(url).then((response) => response.blob());
  blob
    .then((image) => createImageBitmap(image, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" }))
    .then((bitmap) => {
      texture.image = bitmap;
      texture.needsUpdate = true;
    })
    .catch((err) => console.warn(`Couldn't load an effect texture: ${err.message}`));
}

function newTexture(wrap) {
  const texture = new THREE.Texture();
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.flipY = false;
  texture.wrapS = texture.wrapT = wrap;
  return texture;
}

// A sheet's texture, which is blank for the moment it takes to load.
export function sheetTexture(sheet) {
  if (loaded.has(sheet)) return loaded.get(sheet);
  const texture = newTexture(THREE.ClampToEdgeWrapping);
  loaded.set(sheet, texture);
  loadInto(texture, sheet.bytes, sheet.url);
  return texture;
}

const repeatingLoaded = new Map(); // by the world's bytes, or by a stock name

// A repeating texture, which is blank for the moment it takes to load. A name that isn't one is plain.
export function repeatingTexture(name) {
  const bytes = worldRepeating.get(name);
  const known = bytes || stock.repeating.includes(name) ? name : "plain";
  const key = bytes ?? known;
  if (!repeatingLoaded.has(key)) {
    const texture = newTexture(THREE.RepeatWrapping);
    repeatingLoaded.set(key, texture);
    loadInto(texture, bytes, `/effects/${known}.png`);
  }
  return repeatingLoaded.get(key);
}

// Sets every texture loading, so the first effect to use each one shows.
export function loadEffectTextures() {
  for (const sheet of effectSheets()) sheetTexture(sheet);
  for (const name of repeatingNames()) repeatingTexture(name);
}
