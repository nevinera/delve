import {commitFiles} from "../github/commitFiles";
import {resolveFullUnitType} from "./resolveFullUnitType";

// Unlike saveAbility, a unit type's own JSON never holds direct asset
// references (icons/sounds live on the abilities it points at, authored
// separately in the ability editor) - so there's nothing to upload here,
// just the abstract file plus its resolved companion.
//
// Commits unit-types/<key>.json (the authoring form, with $ref powers) and
// unit-types/<key>.full.json (every power inlined via resolveFullUnitType)
// in one atomic commit - see docs/schema/common.md#assetreference: an
// abstract config must have a concrete .full.json alongside it.
export async function saveUnitType(key, unitTypeData, availableAbilities) {
  const fullUnitType = await resolveFullUnitType(key, unitTypeData, availableAbilities);
  return commitFiles(
    {[`unit-types/${key}.json`]: unitTypeData, [`unit-types/${key}.full.json`]: fullUnitType},
    {message: `Update ${unitTypeData.name || key}`}
  );
}
