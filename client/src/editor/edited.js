import { strFromU8, strToU8 } from "fflate";
import { editedPath } from "../world/paths.js";

// Tiles changed by hand in the detail editor, which generating leaves alone unless told otherwise:
// "tx,tz" keys, kept per continent at places/continents/<continent>/edited.json as
// { "tiles": [...] }.

export { editedPath };

export function loadEdited(files, continent) {
  const bytes = files.get(editedPath(continent));
  return new Set(bytes ? JSON.parse(strFromU8(bytes)).tiles : []);
}

export function saveEdited(files, continent, keys) {
  if (!keys.size) return files.delete(editedPath(continent));
  files.set(editedPath(continent), strToU8(`${JSON.stringify({ tiles: [...keys].sort() })}\n`));
}
