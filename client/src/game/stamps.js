// Decoration stamps (see plans/decoration-stamps.md): images baked into a
// map's ground, under everything else. A zone's stamps are sets, each one
// sheet image holding many stamps ({[set]: {imageUrl, stamps: {[key]:
// {feetWidth, frames?}}}}); a map places them by "set/key" with a
// position in its feet, a rotation (degrees clockwise) and a scale.

// A set whose license is share-alike (CC-BY-SA-4.0): images baked from it
// that we publish (thumbnails, screenshots) must be share-alike too.
export const isShareAlike = (set) => /(^|-)SA(-|$)/.test(set?.license ?? "");

// The share-alike sets placed stamps use: [set key].
export function shareAlikeSetsUsed(sets, placedStamps) {
  const used = new Set((placedStamps ?? []).map((placed) => String(placed.stamp ?? "").split("/")[0]));
  return [...used].filter((set) => isShareAlike(sets?.[set])).sort();
}

// The stamp a placed one is, or null if the zone has no such stamp.
export function stampFor(sets, placed) {
  const [set, key] = String(placed.stamp ?? "").split("/");
  const stamp = sets?.[set]?.stamps?.[key];
  return stamp ? {set, key, stamp} : null;
}

// Which frame a placed stamp shows: its variant, else one picked from its
// position, so scattered copies vary without the author choosing.
export function variantIndex(placed, frameCount) {
  if (frameCount <= 1) return 0;
  if (Number.isInteger(placed.variant)) return Math.min(placed.variant, frameCount - 1);
  let h = Math.imul(Math.round(placed.x * 10), 73856093) ^ Math.imul(Math.round(placed.y * 10), 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) % frameCount;
}

// The frame rect a placed stamp draws from its sheet: one of its frames, or
// the whole sheet when it has none.
export function stampFrame(stamp, placed, sheet) {
  const frames = stamp.frames ?? [];
  if (!frames.length) return {x: 0, y: 0, width: sheet.naturalWidth ?? sheet.width, height: sheet.naturalHeight ?? sheet.height};
  return frames[variantIndex(placed, frames.length)];
}

// A placed stamp's size in feet.
export function stampFeet(stamp, placed, frame) {
  const width = stamp.feetWidth * (placed.scale ?? 1);
  return {width, height: (width * frame.height) / frame.width};
}

// Loads each set's sheet: {[set]: image}, leaving out any that fail.
// urlFor(imageUrl) makes a set's imageUrl loadable.
export async function loadStampSheets(sets, urlFor, loadImage = loadSheetImage) {
  const entries = await Promise.all(
    Object.entries(sets ?? {}).map(async ([set, {imageUrl}]) => {
      try {
        return [set, await loadImage(urlFor(imageUrl))];
      } catch {
        console.warn(`Couldn't load stamp sheet ${set} (${imageUrl})`);
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter(Boolean));
}

function loadSheetImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Draws placed stamps onto ctx, whose pixels cover the map at
// pixelsPerFoot, in list order. Ones with no stamp or no sheet are skipped.
export function drawStamps(ctx, placedStamps, sets, sheets, pixelsPerFoot) {
  for (const placed of placedStamps ?? []) {
    const found = stampFor(sets, placed);
    const sheet = found && sheets[found.set];
    if (!sheet) continue;
    const frame = stampFrame(found.stamp, placed, sheet);
    const feet = stampFeet(found.stamp, placed, frame);
    const [width, height] = [feet.width * pixelsPerFoot, feet.height * pixelsPerFoot];
    ctx.save();
    ctx.translate(placed.x * pixelsPerFoot, placed.y * pixelsPerFoot);
    if (placed.rotation) ctx.rotate((placed.rotation * Math.PI) / 180);
    ctx.drawImage(sheet, frame.x, frame.y, frame.width, frame.height, -width / 2, -height / 2, width, height);
    ctx.restore();
  }
}

// Bakes a map's stamps into its ground canvas (which covers the map's
// feetDimensions) and returns it.
export function bakeStamps(canvas, feetDimensions, placedStamps, sets, sheets) {
  if (placedStamps?.length) drawStamps(canvas.getContext("2d"), placedStamps, sets, sheets, canvas.width / feetDimensions.width);
  return canvas;
}
