import {dirname, rebaseRelativeUrls} from "../content/rebaseRelativeUrls";

// A unit type stores every power inline (no $refs - see
// docs/schema/unit_type.md), so any power brought in from elsewhere (the
// abilities/ library, another unit type, or an older unit type file that
// still uses $refs) is copied in, with its relative asset URLs rewritten to
// stay correct from the unit type's own file.

export function unitTypePath(key) {
  return `unit_types/${key}.json`;
}

export function resolveRepoPath(fromFile, relativePath) {
  const url = new URL(relativePath, `https://_/${fromFile}`);
  return url.pathname.replace(/^\//, "");
}

function rebase(content, sourceFile, targetFile) {
  return rebaseRelativeUrls(content, dirname(sourceFile), dirname(targetFile));
}

// Replaces each $ref power in data (the parsed file at filePath) with the
// referenced ability's content, rebased to filePath. Inline powers are
// left alone.
export async function expandPowers(client, data, filePath) {
  if (!data.powers) return data;
  const powers = await Promise.all(data.powers.map(async (entry) => {
    if (typeof entry?.$ref !== "string") return entry;
    const path = resolveRepoPath(filePath, entry.$ref);
    const content = await client.fetchFile(path);
    if (content === null) throw new Error(`Power "${entry.$ref}" points at ${path}, which doesn't exist`);
    return rebase(JSON.parse(content), path, filePath);
  }));
  return {...data, powers};
}

export async function listLibraryAbilities(client) {
  return (await client.listDirectory("abilities")).filter((path) => path.endsWith(".json")).sort();
}

export async function listUnitTypeFiles(client) {
  return (await client.listDirectory("unit_types")).filter((path) => path.endsWith(".json")).sort();
}

export async function fetchLibraryPower(client, unitTypeKey, abilityPath) {
  const content = await client.fetchFile(abilityPath);
  if (content === null) throw new Error(`${abilityPath} doesn't exist`);
  return rebase(JSON.parse(content), abilityPath, unitTypePath(unitTypeKey));
}

// Every power of the unit type at sourcePath, expanded and rebased to
// unitTypeKey's own file.
export async function fetchUnitTypePowers(client, unitTypeKey, sourcePath) {
  const content = await client.fetchFile(sourcePath);
  if (content === null) throw new Error(`${sourcePath} doesn't exist`);
  const source = await expandPowers(client, JSON.parse(content), sourcePath);
  return (source.powers ?? []).map((power) => rebase(power, sourcePath, unitTypePath(unitTypeKey)));
}
