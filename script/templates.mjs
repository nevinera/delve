// Writes the built-in templates (client/src/world/builtin/templates.json) from the built-in
// structures, one slab or object a line.
//
//   node script/templates.mjs
import fs from "fs";
import { builtinTemplatesJson } from "../client/src/editor/structureTemplates.js";

fs.writeFileSync(new URL("../client/src/world/builtin/templates.json", import.meta.url), builtinTemplatesJson());
