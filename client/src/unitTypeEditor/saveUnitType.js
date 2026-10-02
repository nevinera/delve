import {commitFiles} from "../github/commitFiles";
import {currentFieldValue} from "../abilityEditor/resolveAbilityForPlayback";
import {resolveRepoPath, unitTypePath} from "./powerSources";

// Commits unit_types/<key>.json (every power inline - a unit type is no
// longer abstract, so it has no .full.json companion) plus every pending
// upload, in one atomic commit. Each upload is written to wherever its
// field currently points, relative to the unit type's own file - the same
// "write wherever the field currently says" approach as saveAbility.js.
//
// uploads:
//   tokenFiles  - {tokenImageUrl index: File}
//   powerFiles  - {power index: {assetOverrideKey: File}}
//   deletePaths - repo paths to remove in the same commit (a stale
//                 .full.json left over from the $ref era)
export async function saveUnitType(key, unitTypeData, {tokenFiles = {}, powerFiles = {}, deletePaths = []} = {}, commitMessage) {
  const ownPath = unitTypePath(key);
  const filesByPath = {[ownPath]: unitTypeData};
  const missingPaths = [];

  function addUpload(label, relativePath, file) {
    if (!relativePath) {
      missingPaths.push(label);
      return;
    }
    filesByPath[resolveRepoPath(ownPath, relativePath)] = file;
  }

  for (const [index, file] of Object.entries(tokenFiles)) {
    addUpload(`tokenImageUrl[${index}]`, (unitTypeData.tokenImageUrl ?? [])[Number(index)], file);
  }
  for (const [powerIndex, files] of Object.entries(powerFiles)) {
    const power = (unitTypeData.powers ?? [])[Number(powerIndex)] ?? {};
    for (const [overrideKey, file] of Object.entries(files)) {
      addUpload(`${power.name || `power ${Number(powerIndex) + 1}`} ${overrideKey}`, currentFieldValue(power, overrideKey), file);
    }
  }
  if (missingPaths.length > 0) {
    throw new Error(`Set a path before saving for: ${missingPaths.join(", ")}`);
  }

  for (const path of deletePaths) filesByPath[path] = null;

  return commitFiles(filesByPath, {message: commitMessage || `Update ${unitTypeData.name || key}`});
}
