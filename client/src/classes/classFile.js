import { newObjectId } from "../world/builtObjects.js";
import { gameDataPath, isClassPath } from "../world/paths.js";

// A class, as the world keeps it in classes/<id>.json.

export const classPath = (id) => gameDataPath("classes", id);

export const newClass = (name = "new class", random = Math.random) => ({ id: newObjectId(random), name });

// The world's classes, by name. world: readJson and its files.
export function classesOf(world) {
  return [...world.files.keys()]
    .filter(isClassPath)
    .map((path) => world.readJson(path))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
