import {resolveReferences} from "../content/resolveReferences";
import {abilityKeyForRef} from "./powerRefs";

// Produces the fully-resolved ("full") form of a class draft: every power's
// $ref dereferenced into the real ability content, recursively - this is
// what eventually gets committed as classes/<key>.full.json (see
// docs/schema/common.md#assetreference). The abilities themselves are
// already fetched by Build::ClassesController#edit (see
// availableAbilities), so no network access is needed here.
export function resolveFullClass(classKey, classData, availableAbilities) {
  return resolveReferences(classData, (ref, referenceTo) => {
    if (referenceTo !== "ability") {
      throw new Error(`Don't know how to resolve a "${referenceTo}" reference from a class`);
    }

    const key = abilityKeyForRef(classKey, {$ref: ref});
    const entry = key && availableAbilities[key];
    if (!entry) {
      throw new Error(`No ability loaded for reference "${ref}" - is it under abilities/classes/${classKey}/?`);
    }

    return entry.ability;
  });
}
