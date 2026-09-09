import {commitFiles} from "../github/commitFiles";

// Unlike saveAbility, a class's own JSON never holds direct asset
// references (icons/sounds live on the abilities it points at, authored
// separately in the ability editor) - so there's nothing to upload here,
// just the one file.
export async function saveClass(key, classData) {
  return commitFiles({[`classes/${key}.json`]: classData}, {message: `Update ${classData.name || key}`});
}
