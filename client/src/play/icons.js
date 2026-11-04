import names from "./icons.json";

// The stock icons abilities, statuses and items pick by name: white shapes in public/icons, each
// drawn in its element's text color.

export const ICON_NAMES = names;
const KNOWN = new Set(names);

// Where an icon's file is, or null for a name that isn't one.
export function iconUrl(name) {
  return KNOWN.has(name) ? `/icons/${name}.svg` : null;
}

// An element showing an icon, or null for a name that isn't one, for the caller to stand in for.
export function iconNode(name, className = "") {
  const url = iconUrl(name);
  if (!url) return null;
  const node = document.createElement("span");
  node.className = `stock-icon ${className}`.trim();
  node.style.maskImage = `url(${url})`;
  return node;
}
