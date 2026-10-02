import {dirname, rebaseRelativeUrls} from "../content/rebaseRelativeUrls";
import {currentFieldValue} from "../abilityEditor/resolveAbilityForPlayback";

// Unit types and classes store every power inline (no $refs), so any power
// brought in from elsewhere (the abilities/ library, another unit type or
// class, or an older file that still uses $refs) is copied in, with its
// relative asset URLs rewritten to stay correct from the owning file.
// `ownPath` throughout is that owning file's repo path, e.g.
// "unit_types/goblin.json" or "classes/puncher.json".

export function resolveRepoPath(fromFile, relativePath) {
  const url = new URL(relativePath, `https://_/${fromFile}`);
  return url.pathname.replace(/^\//, "");
}

function rebase(content, sourceFile, targetFile) {
  return rebaseRelativeUrls(content, dirname(sourceFile), dirname(targetFile));
}

async function fetchJson(client, path) {
  const content = await client.fetchFile(path);
  if (content === null) throw new Error(`${path} doesn't exist`);
  return JSON.parse(content);
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

function isOwnFile(path) {
  return path.endsWith(".json") && !path.endsWith(".full.json");
}

// A file-backed source: each source is one file of that kind (another
// class or unit type), and its powers are that file's own powers.
function fileSourceType(id, label, dir) {
  return {
    id,
    label,
    async listSources(client, ownPath) {
      const paths = await client.listDirectory(dir);
      return paths.filter((path) => isOwnFile(path) && path !== ownPath).sort().map((path) => ({
        id: path,
        label: path.replace(new RegExp(`^${dir}/`), "").replace(/\.json$/, ""),
      }));
    },
    async loadPowers(client, sourceId, ownPath) {
      const source = await expandPowers(client, await fetchJson(client, sourceId), sourceId);
      return (source.powers ?? []).map((power) => rebase(power, sourceId, ownPath));
    },
  };
}

// The import panel's three stages: a source type, then one source of that
// type, then one of its powers. The power library's sources are its
// folders, each holding one ability per file.
export const IMPORT_SOURCE_TYPES = [
  {
    id: "library",
    label: "Power library",
    async listSources(client) {
      const paths = (await client.listDirectory("abilities")).filter(isOwnFile);
      return [...new Set(paths.map(dirname))].sort().map((dir) => ({
        id: dir,
        label: dir === "abilities" ? "(top level)" : dir.replace(/^abilities\//, ""),
      }));
    },
    async loadPowers(client, sourceId, ownPath) {
      const paths = (await client.listDirectory(sourceId)).filter((path) => isOwnFile(path) && dirname(path) === sourceId).sort();
      return Promise.all(paths.map(async (path) => rebase(await fetchJson(client, path), path, ownPath)));
    },
  },
  fileSourceType("class", "Class", "classes"),
  fileSourceType("unitType", "Unit type", "unit_types"),
];

// Pending power asset uploads ({power index: {assetOverrideKey: File}}),
// as the {repoPath: File} entries a save commits - each written to wherever
// its field currently points, relative to ownPath. Labels any upload whose
// field is blank (nowhere to write it) in `missing` instead.
export function powerUploadFiles(ownPath, powers, powerFiles) {
  const files = {};
  const missing = [];
  for (const [powerIndex, uploads] of Object.entries(powerFiles)) {
    const power = powers[Number(powerIndex)] ?? {};
    for (const [overrideKey, file] of Object.entries(uploads)) {
      const relativePath = currentFieldValue(power, overrideKey);
      if (relativePath) files[resolveRepoPath(ownPath, relativePath)] = file;
      else missing.push(`${power.name || `power ${Number(powerIndex) + 1}`} ${overrideKey}`);
    }
  }
  return {files, missing};
}
