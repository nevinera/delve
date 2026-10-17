// Lays images out on a sprite sheet in rows. `sizes` is [{width, height}];
// returns {placements: [{x, y}], width, height}. startY and minWidth leave
// room for an existing sheet above (its pixels and frames don't move).
export const SHEET_MAX_WIDTH = 2048;
export const SHEET_GAP = 2;

export function packImages(sizes, {startY = 0, minWidth = 0, maxWidth = SHEET_MAX_WIDTH, gap = SHEET_GAP} = {}) {
  const placements = [];
  let x = 0;
  let y = startY;
  let rowHeight = 0;
  let width = minWidth;
  for (const size of sizes) {
    if (x > 0 && x + size.width > maxWidth) {
      y += rowHeight + gap;
      x = 0;
      rowHeight = 0;
    }
    placements.push({x, y});
    x += size.width + gap;
    width = Math.max(width, x - gap);
    rowHeight = Math.max(rowHeight, size.height);
  }
  return {placements, width, height: sizes.length ? y + rowHeight : startY};
}

// The sheet as a PNG Blob: `base` (an image, or null) at the top left, then
// each {image, x, y}.
export async function composeSheet({base, items, width, height}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (base) context.drawImage(base, 0, 0);
  for (const {image, x, y} of items) context.drawImage(image, x, y);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't make the sheet image"))), "image/png");
  });
}

export function loadFileImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`${file.name} isn't an image the browser can read`));
    image.src = url;
  });
}
