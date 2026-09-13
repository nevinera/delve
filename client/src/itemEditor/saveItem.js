import {commitFiles} from "../github/commitFiles";

// Unlike saveUnitType/saveClass, an item has no $ref fields at all (see
// docs/schema/item.md) - just the one file, no .full.json companion.
export async function saveItem(key, itemData) {
  return commitFiles({[`items/${key}.json`]: itemData}, {message: `Update ${itemData.name || key}`});
}
