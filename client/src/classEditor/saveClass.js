import {commitFiles} from "../github/commitFiles";
import {resolveFullClass} from "./resolveFullClass";

// Unlike saveAbility, a class's own JSON never holds direct asset
// references (icons/sounds live on the abilities it points at, authored
// separately in the ability editor) - so there's nothing to upload here,
// just the abstract file plus its resolved companion.
//
// Commits classes/<key>.json (the authoring form, with $ref powers) and
// classes/<key>.full.json (every power inlined via resolveFullClass) in one
// atomic commit - see docs/schema/common.md#assetreference: an abstract
// config must have a concrete .full.json alongside it.
export async function saveClass(key, classData, availableAbilities) {
  const fullClass = await resolveFullClass(key, classData, availableAbilities);
  return commitFiles(
    {[`classes/${key}.json`]: classData, [`classes/${key}.full.json`]: fullClass},
    {message: `Update ${classData.name || key}`}
  );
}
