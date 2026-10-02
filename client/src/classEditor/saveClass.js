import {commitFiles} from "../github/commitFiles";
import {powerUploadFiles} from "../powersEditor/powerSources";

// Commits classes/<key>.json (every power inline - a class is no longer
// abstract, so it has no .full.json companion) plus any pending power asset
// uploads, in one atomic commit.
//
// powerFiles  - {power index: {assetOverrideKey: File}}, each written to
//               wherever its field currently points (see powerUploadFiles)
// deletePaths - repo paths to remove in the same commit (a stale
//               .full.json left over from the $ref era)
export async function saveClass(key, classData, {powerFiles = {}, deletePaths = []} = {}, commitMessage) {
  const ownPath = `classes/${key}.json`;
  const {files, missing} = powerUploadFiles(ownPath, classData.powers ?? [], powerFiles);
  if (missing.length > 0) {
    throw new Error(`Set a path before saving for: ${missing.join(", ")}`);
  }

  const filesByPath = {[ownPath]: classData, ...files};
  for (const path of deletePaths) filesByPath[path] = null;
  return commitFiles(filesByPath, {message: commitMessage || `Update ${classData.name || key}`});
}
