// Bringing shared-library content into a world (see
// plans/world-editor/README.md: a world is self-contained). The content is
// copied in, and every asset it uses (tokens, icons, graphics, sounds) is
// copied to the same place under worlds/<w>/ - tokens/unit/goblin.webp ->
// worlds/<w>/tokens/unit/goblin.webp - so repeated imports share copies.
// Copies are ExistingBlobs: nothing is downloaded or re-uploaded.
import {ExistingBlob} from "../../github/commitFiles";
import {expandPowers} from "../../powersEditor/powerSources";
import {normalizeUnitType} from "../../unitTypeEditor/UnitTypeWorkbench";
import {createUnitType} from "./unitTypeOps";
import {createItem} from "./itemOps";
import {itemFile, relativePath, resolvePath, unitTypeFile, worldDir} from "./worldPaths";

const URL_FIELD_NAMES = new Set(["iconURL", "sourceURL", "imageUrl", "thumbnailUrl", "tokenImageUrl", "icon_url"]);

function isRelative(value) {
  return typeof value === "string" && value !== "" && !(value.startsWith(":") && value.endsWith(":"))
    && !value.startsWith("/") && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

// Rewrites every relative asset URL in content (written relative to
// sourceFile) to point at the world's copy, relative to targetFile.
// Returns {content, assets: [repo path of each library asset used]}.
export function relocateAssets(content, sourceFile, targetFile, world) {
  const assets = new Set();
  const inWorld = `${worldDir(world)}/`;
  const relocate = (value) => {
    if (!isRelative(value)) return value;
    const path = resolvePath(sourceFile, value);
    if (path === null) return value;
    if (path.startsWith(inWorld)) return relativePath(targetFile, path);
    assets.add(path);
    return relativePath(targetFile, `${inWorld}${path}`);
  };
  const walk = (data) => {
    if (Array.isArray(data)) return data.map(walk);
    if (data === null || typeof data !== "object") return data;
    return Object.fromEntries(Object.entries(data).map(([key, value]) => {
      if (!URL_FIELD_NAMES.has(key)) return [key, walk(value)];
      return [key, Array.isArray(value) ? value.map(relocate) : relocate(value)];
    }));
  };
  return {content: walk(content), assets: [...assets].sort()};
}

// [{to: world path, sha}] for each library asset the world doesn't have
// yet, and the paths of any that don't exist in the library.
async function assetCopies(draft, reader, assets) {
  const copies = [];
  const missing = [];
  for (const path of assets) {
    const to = `${worldDir(draft.worldKey)}/${path}`;
    if (draft.exists(to)) continue;
    const sha = await reader.blobSha(path);
    if (sha) copies.push({to, sha, from: path});
    else missing.push(path);
  }
  return {copies, missing};
}

export function applyCopies(draft, copies) {
  return copies.reduce((next, {to, sha, from}) => (next.exists(to) ? next : next.write(to, new ExistingBlob(sha, from))), draft);
}

// The shared library's files under dir: [{path, label}], label being the
// key under dir.
async function libraryFiles(reader, dir) {
  const paths = await reader.listDirectory(dir);
  return paths.filter((path) => path.endsWith(".json") && !path.endsWith(".full.json"))
    .map((path) => ({path, label: path.slice(dir.length + 1, -".json".length)}));
}

export const libraryUnitTypes = (reader) => libraryFiles(reader, "unit_types");
export const libraryItems = (reader) => libraryFiles(reader, "items");

// Imports a library unit type as the world's unit type `key`: powers
// inline (any $ref expanded), every asset copied in. Resolves to
// {apply(draft) -> nextDraft, missing: [asset paths not found]}, so the
// (async) reading happens before the draft is touched.
export async function prepareUnitTypeImport(draft, reader, sourcePath, key) {
  createUnitType(draft, key); // checks the key is valid and free
  const raw = JSON.parse(await reader.fetchFile(sourcePath));
  const expanded = normalizeUnitType(await expandPowers(reader, raw, sourcePath));
  const target = unitTypeFile(draft.worldKey, key);
  const {content, assets} = relocateAssets(expanded, sourcePath, target, draft.worldKey);
  const {copies, missing} = await assetCopies(draft, reader, assets);
  return {
    missing,
    apply: (current) => applyCopies(createUnitType(current, key), copies).write(target, content),
  };
}

// A power copied from the library into a world file (targetFile): its
// assets relocated, with the copies to make once it's adopted.
export async function preparePowerImport(draft, reader, power, sourceFile, targetFile) {
  const {content, assets} = relocateAssets(power, sourceFile, targetFile, draft.worldKey);
  const {copies} = await assetCopies(draft, reader, assets);
  return {power: content, copies};
}

// Imports a library item as the world's item `key` (its identifier set to
// match), with its icon copied in. Same shape as prepareUnitTypeImport.
export async function prepareItemImport(draft, reader, sourcePath, key) {
  createItem(draft, key); // checks the key is valid and free
  const raw = JSON.parse(await reader.fetchFile(sourcePath));
  const target = itemFile(draft.worldKey, key);
  const {content, assets} = relocateAssets({...raw, identifier: key}, sourcePath, target, draft.worldKey);
  const {copies, missing} = await assetCopies(draft, reader, assets);
  return {
    missing,
    apply: (current) => applyCopies(createItem(current, key), copies).write(target, content),
  };
}
