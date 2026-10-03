// A world's own image and audio files, as the editors pick and upload them
// (see plans/world-editor/README.md: nothing in a world points outside
// worlds/<w>/). Uploads are pending Blobs in the draft until Save.
import {currentFieldValue} from "../../abilityEditor/resolveAbilityForPlayback";
import {relativePath, resolvePath, worldDir} from "./worldPaths";

const IMAGE_EXTENSIONS = /\.(png|webp|jpe?g|gif|svg)$/i;

// The world's images under subdir (e.g. "tokens"), as a file at fromFile
// refers to them: {value: path relative to fromFile, label: path under
// subdir, url}.
export function imageOptions(draft, fromFile, subdir, assetUrl) {
  const dir = `${worldDir(draft.worldKey)}/${subdir}`;
  return draft.paths(dir).filter((p) => IMAGE_EXTENSIONS.test(p)).map((p) => ({
    value: relativePath(fromFile, p), label: p.slice(dir.length + 1), url: assetUrl(p),
  }));
}

export const tokenImageOptions = (draft, fromFile, assetUrl) => imageOptions(draft, fromFile, "tokens", assetUrl);

// A free path for an upload named `name` in the world directory `subdir`
// (e.g. "tokens/ncu"), numbered if the name's taken.
export function newAssetPath(draft, subdir, name) {
  const dir = `${worldDir(draft.worldKey)}/${subdir}`;
  const safe = name.replace(/[^A-Za-z0-9_.-]/g, "-");
  const dot = safe.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [safe.slice(0, dot), safe.slice(dot)] : [safe, ""];
  let target = `${dir}/${safe}`;
  for (let n = 2; draft.exists(target); n++) target = `${dir}/${base}-${n}${ext}`;
  return target;
}

// Reads a picked file into memory, so a dropped file's handle going stale
// can't break the later Save.
export async function inMemory(file) {
  return new Blob([await file.arrayBuffer()], {type: file.type});
}

// ---- Power assets (icons, graphic and sound effects) ----
// A power's uploadable fields, as assetOverrideKey names them (see
// resolveAbilityForPlayback): its iconURL, and each graphic/sound effect's
// sourceURL.
function powerAssetKeys(power) {
  const entryKeys = (section) => (power[section] ?? []).map((_, i) => `${section}[${i}].sourceURL`);
  return ["iconURL", ...entryKeys("graphicEffects"), ...entryKeys("soundEffects")];
}

const POWER_ASSET_DIRS = {iconURL: "graphics/icons", graphicEffects: "graphics", soundEffects: "audio"};

function withFieldValue(power, key, value) {
  const match = key.match(/^(.+)\[(\d+)\]\.(.+)$/);
  if (!match) return {...power, [key]: value};
  const [, section, index, field] = match;
  return {...power, [section]: power[section].map((entry, i) => (i === Number(index) ? {...entry, [field]: value} : entry))};
}

// {power index: {key: displayable URL}} for each power asset field whose
// file is a pending upload - what PowerPanel shows "Restore" for.
export function pendingPowerAssets(draft, fromFile, powers, assetUrl) {
  return Object.fromEntries((powers ?? []).map((power, i) => [i, Object.fromEntries(powerAssetKeys(power).flatMap((key) => {
    const value = currentFieldValue(power, key);
    const path = value && resolvePath(fromFile, value);
    return path && draft.assetSource(path)?.blob ? [[key, assetUrl(path)]] : [];
  }))]));
}

// Stores an uploaded power asset where its field points - or, when the
// field is blank or points outside the world, at a new path in the world
// (graphics/icons/, graphics/ or audio/), pointing the field there.
// Returns [nextDraft, nextPower].
export function uploadPowerAsset(draft, fromFile, power, key, blob, fileName) {
  const value = currentFieldValue(power, key);
  const resolved = value && resolvePath(fromFile, value);
  if (resolved && resolved.startsWith(`${worldDir(draft.worldKey)}/`)) return [draft.write(resolved, blob), power];
  const target = newAssetPath(draft, POWER_ASSET_DIRS[key.split("[")[0]], fileName);
  return [draft.write(target, blob), withFieldValue(power, key, relativePath(fromFile, target))];
}
