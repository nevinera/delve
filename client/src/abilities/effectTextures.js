import * as THREE from "three";
import { strFromU8 } from "fflate";
import { EFFECT_SHEET_PATH, effectImagePath } from "../world/paths.js";
import stock from "./stockTextures.json";

// The grayscale textures effects tint and pick by name. Each is a cell of a sheet: the stock sheet in
// public/effects, or one of the world's own (.agents/formats.md), whose names win over stock ones.

export const STOCK_SHEET = { url: "/effects/stock.png", columns: stock.columns, rows: stock.rows, textures: stock.textures };

let worldSheets = [];

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
  for (const [path, bytes] of all) {
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

const loaded = new WeakMap();

// A sheet's texture, which is blank for the moment it takes to load. Its image's bottom row comes
// first, so a cell's up is up.
export function sheetTexture(sheet) {
  if (loaded.has(sheet)) return loaded.get(sheet);
  const texture = new THREE.Texture();
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.flipY = false;
  loaded.set(sheet, texture);
  if (typeof createImageBitmap === "function") {
    const blob = sheet.bytes ? Promise.resolve(new Blob([sheet.bytes], { type: "image/png" })) : fetch(sheet.url).then((response) => response.blob());
    blob
      .then((image) => createImageBitmap(image, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" }))
      .then((bitmap) => {
        texture.image = bitmap;
        texture.needsUpdate = true;
      })
      .catch((err) => console.warn(`Couldn't load an effect sheet: ${err.message}`));
  }
  return texture;
}
