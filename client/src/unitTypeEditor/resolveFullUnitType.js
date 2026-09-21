import {resolveReferences} from "../content/resolveReferences";
import {dirname, rebaseRelativeUrls} from "../content/rebaseRelativeUrls";
import {abilityKeyForRef} from "./abilityRefs";

// Produces the fully-resolved ("full") form of a unit type draft: every
// power's $ref dereferenced into the real ability content, recursively -
// this is what eventually gets committed as unit_types/<key>.full.json (see
// docs/schema/common.md#assetreference). The abilities themselves are
// already fetched by Build::UnitTypesController#edit (see
// availableAbilities), so no network access is needed here.
export function resolveFullUnitType(unitTypeKey, unitTypeData, availableAbilities) {
  const unitTypeDir = dirname(unitTypeKey);
  const targetDir = unitTypeDir ? `unit_types/${unitTypeDir}` : "unit_types";

  return resolveReferences(unitTypeData, (ref, referenceTo) => {
    if (referenceTo !== "ability") {
      throw new Error(`Don't know how to resolve a "${referenceTo}" reference from a unit type`);
    }

    const key = abilityKeyForRef(unitTypeKey, {$ref: ref});
    const entry = key && availableAbilities[key];
    if (!entry) {
      throw new Error(`No ability loaded for reference "${ref}" - is it under abilities/units/${unitTypeKey}/?`);
    }

    // entry.ability's own icon/effect URLs are relative to abilities/<key>/
    // (its own file's directory) - they need rewriting now that it's about
    // to be embedded at targetDir instead. See rebaseRelativeUrls.js.
    return rebaseRelativeUrls(entry.ability, `abilities/${dirname(key)}`, targetDir);
  });
}
