import { strFromU8 } from "fflate";
import { ICON_PATH } from "../world/paths.js";
import names from "./icons.json";

// The icons abilities, statuses and items pick by name: the stock ones in public/icons, and the
// world's own (.agents/formats.md), which win over a stock one of the same name. Each is a shape,
// drawn in its element's text color.

const STOCK = new Set(names);
let worldIcons = new Map(); // name -> data URL

// A world's icons, from its files: [path, bytes] pairs. They're only ever used as CSS images, which
// can't run what's in them. As data URLs so they draw whatever type the host serves them as.
export function setWorldIcons(files) {
  worldIcons = new Map();
  for (const [path, bytes] of files) {
    const name = ICON_PATH.exec(path)?.[1];
    if (name && bytes) worldIcons.set(name, `data:image/svg+xml,${encodeURIComponent(strFromU8(bytes))}`);
  }
}

// Every icon's name, the world's first.
export function iconNames() {
  return [...worldIcons.keys(), ...names.filter((name) => !worldIcons.has(name))];
}

// Where an icon's image is, or null for a name that isn't one.
export function iconUrl(name) {
  return worldIcons.get(name) ?? (STOCK.has(name) ? `/icons/${name}.svg` : null);
}

// An element showing an icon, or null for a name that isn't one, for the caller to stand in for.
export function iconNode(name, className = "") {
  const url = iconUrl(name);
  if (!url) return null;
  const node = document.createElement("span");
  node.className = `stock-icon ${className}`.trim();
  node.style.maskImage = `url("${url}")`;
  return node;
}
