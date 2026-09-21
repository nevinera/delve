import {commitFiles} from "../github/commitFiles";
import {currentFieldValue} from "./resolveAbilityForPlayback";

// Resolves a relative asset path (as stored in the ability JSON, e.g.
// "../graphics/icons/x.svg") against the ability's own location in the
// repo, the same way the server resolves it when fetching (see
// Build::AbilitiesController#asset_data_uri) - abilities/<key>.json is the
// base (key may itself contain "/"s, placing the ability in a subdirectory,
// e.g. "classes/druid/wildshape"), so "../graphics/..." lands wherever it
// would relative to that file's own directory.
function resolveRepoPath(key, relativePath) {
  const url = new URL(relativePath, `https://_/abilities/${key}.json`);
  return url.pathname.replace(/^\//, "");
}

// Commits the ability JSON plus every pending file upload as a single
// commit. pendingFiles is keyed the same way as assetOverrides
// (assetOverrideKey(section, index, field), or a bare top-level field name
// like "iconURL") - each upload is written to whatever path that field
// currently holds, since that's the only way to know where an uploaded
// image/sound belongs. Throws if any pending upload's field is still
// blank (nowhere to put it) rather than silently dropping it.
export async function saveAbility(key, ability, pendingFiles) {
  const filesByPath = {[`abilities/${key}.json`]: ability};
  const missingPaths = [];

  for (const [overrideKey, file] of Object.entries(pendingFiles)) {
    const relativePath = currentFieldValue(ability, overrideKey);
    if (!relativePath) {
      missingPaths.push(overrideKey);
      continue;
    }
    filesByPath[resolveRepoPath(key, relativePath)] = file;
  }

  if (missingPaths.length > 0) {
    throw new Error(`Set a path before saving for: ${missingPaths.join(", ")}`);
  }

  return commitFiles(filesByPath, {message: `Update ${ability.name || key}`});
}
