// A zone's decoration stamps (docs/schema/zone.md#stamps): sets copied in
// from the shared library (graphics/stamps/<set>.json, with its sheet
// image), kept in the zone's stamps.json, which the zone file $refs. Their
// sheets are copied to the world like any library asset (see importing.js).
import {applyCopies, assetCopies, relocateAssets} from "./importing";
import {updateZone, zoneData} from "./zoneOps";
import {resolvePath, zoneFile, zoneStampsFile} from "./worldPaths";

export const STAMP_LIBRARY_DIR = "graphics/stamps";

// The zone's stamp sets and the file they're written in (null when the
// zone has none): inline in the zone file, or in the file it $refs.
export function zoneStamps(draft, zone) {
  const path = zoneFile(draft.worldKey, zone);
  const stamps = zoneData(draft, zone)?.stamps;
  if (!stamps) return {sets: {}, file: null};
  if (typeof stamps.$ref === "string") {
    const file = resolvePath(path, stamps.$ref);
    return {sets: (file && draft.read(file)) || {}, file};
  }
  return {sets: stamps, file: path};
}

// The repo path of a set's sheet.
export function stampSheetPath(draft, zone, set) {
  const {sets, file} = zoneStamps(draft, zone);
  const imageUrl = sets[set]?.imageUrl;
  return imageUrl && file ? resolvePath(file, imageUrl) : null;
}

// The library's stamp sets: [{path, label}], label being the set's key.
export async function libraryStampSets(reader) {
  const paths = await reader.listDirectory(STAMP_LIBRARY_DIR);
  // Only the built sets: their sources (src/<set>/) sit below.
  return paths.map((path) => ({path, label: path.slice(STAMP_LIBRARY_DIR.length + 1, -".json".length)}))
    .filter(({path, label}) => path.endsWith(".json") && !label.includes("/"));
}

// Copies the library set at sourcePath into the zone as `key` (replacing
// any set of that key), its sheet copied into the world. Resolves to
// {apply(draft) -> nextDraft, missing: [asset paths not found]}.
export async function prepareStampSetImport(draft, reader, zone, sourcePath, key) {
  const raw = JSON.parse(await reader.fetchFile(sourcePath));
  const target = zoneStampsFile(draft.worldKey, zone);
  const {content, assets} = relocateAssets(raw, sourcePath, target, draft.worldKey);
  const {copies, missing} = await assetCopies(draft, reader, assets);
  return {missing, apply: (current) => setStampSet(applyCopies(current, copies), zone, key, content)};
}

// Writes set `key` into the zone's stamps, moving inline stamps (or none)
// to stamps.json so the zone file only $refs them.
export function setStampSet(draft, zone, key, set) {
  const {sets, file} = zoneStamps(draft, zone);
  const target = zoneStampsFile(draft.worldKey, zone);
  const inline = file === zoneFile(draft.worldKey, zone);
  const next = draft.write(file && !inline ? file : target, {...sets, [key]: set});
  if (file && !inline) return next;
  return updateZone(next, zone, (z) => z.setField("stamps", {$ref: "./stamps.json", referenceTo: "stamps"}));
}
