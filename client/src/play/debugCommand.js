import { BOUNDARIES } from "./boundaries.js";

// /debug, the play page's own command for seeing how the world's drawn. It's open to everyone,
// since it only changes what you see, and /help leaves it out. It gives the lines to answer with.
//   /debug show-boundaries <tile, plate, clutter or all>
//   /debug hide-boundaries [tile, plate, clutter or all]
//   /debug map <smoothed or pixels>   system admins only: the map as drawn, or each chunk's
//                                     steep share as it's kept
const USAGE = ["/debug show-boundaries <tile, plate, clutter or all>", "/debug hide-boundaries [tile, plate, clutter or all]"];
const MAP_USAGE = "/debug map <smoothed or pixels>";

export function debugCommand([sub, ...args], { boundaries, map, admin = false }) {
  const usage = admin ? [...USAGE, MAP_USAGE] : USAGE;
  if (sub === "map" && admin) {
    if (args[0] !== "smoothed" && args[0] !== "pixels") return [`Which? ${MAP_USAGE}`];
    map.raw = args[0] === "pixels";
    return [`The map's ${args[0] === "pixels" ? "drawn a pixel a chunk, darker by how steep" : "smoothed"}.`];
  }
  const kinds = (words) => (words.length === 0 || words.includes("all") ? BOUNDARIES : words);
  const unknown = (words) => words.filter((w) => w !== "all" && !BOUNDARIES.includes(w));
  if (sub === "show-boundaries" || sub === "hide-boundaries") {
    if (sub === "show-boundaries" && args.length === 0) return [`Show which? ${USAGE[0]}`];
    const wrong = unknown(args);
    if (wrong.length) return [`There's no ${wrong.join(" or ")} boundary. Try ${BOUNDARIES.join(", ")} or all.`];
    const shown = sub === "show-boundaries";
    for (const kind of kinds(args)) (shown ? boundaries.show : boundaries.hide).call(boundaries, kind);
    return [`${shown ? "Showing" : "Hiding"} ${kinds(args).join(", ")} boundaries.`];
  }
  return sub ? [`There's no /debug ${sub}.`, ...usage] : usage;
}
