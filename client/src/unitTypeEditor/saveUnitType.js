import {commitFiles} from "../github/commitFiles";
import {resolveFullUnitType} from "./resolveFullUnitType";

// Commits unit_types/<key>.json (the authoring form, with $ref powers),
// unit_types/<key>.full.json (every power inlined via resolveFullUnitType),
// and any pending tokenImageUrl uploads, in one atomic commit - see
// docs/schema/common.md#assetreference: an abstract config must have a
// concrete .full.json alongside it.
//
// pendingFiles (from UnitTypeEditor's uploadTokenImage) is keyed by
// tokenImageUrl array index; each upload is written to wherever that slot's
// path currently points (always ../tokens/unit/<filename>, set at upload
// time) - same "write wherever the field currently says" approach as
// saveAbility.js, just keyed by index instead of field name since
// tokenImageUrl has no other asset-bearing fields to disambiguate.
export async function saveUnitType(key, unitTypeData, availableAbilities, pendingFiles = {}) {
  const fullUnitType = await resolveFullUnitType(key, unitTypeData, availableAbilities);
  const filesByPath = {
    [`unit_types/${key}.json`]: unitTypeData,
    [`unit_types/${key}.full.json`]: fullUnitType,
  };

  const missingPaths = [];
  for (const [index, file] of Object.entries(pendingFiles)) {
    const relativePath = (unitTypeData.tokenImageUrl ?? [])[Number(index)];
    if (!relativePath) {
      missingPaths.push(`tokenImageUrl[${index}]`);
      continue;
    }
    // unit_types/<key>.json is the base - "../tokens/unit/x.webp" from
    // there lands at tokens/unit/x.webp, same resolution AbilityEditor's
    // own resolveRepoPath uses for its own asset-relative paths.
    const url = new URL(relativePath, `https://_/unit_types/${key}.json`);
    filesByPath[url.pathname.replace(/^\//, "")] = file;
  }
  if (missingPaths.length > 0) {
    throw new Error(`Set a path before saving for: ${missingPaths.join(", ")}`);
  }

  return commitFiles(filesByPath, {message: `Update ${unitTypeData.name || key}`});
}
