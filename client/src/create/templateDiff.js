import { CELL_FT } from "../world/constants.js";
import { placedTemplate } from "../world/templates.js";

// How templates differ, for checking before one replaces another: what's in each, counted by
// kind, and how big each is. Things that only moved or turned don't show.

// A template's cells and how far it reaches across and deep, in feet.
export function footprint(template) {
  const { cells } = placedTemplate(template, [0, 0, 0]);
  if (!cells.length) return { cells: 0, across: 0, deep: 0 };
  const [is, js] = [cells.map((c) => c[0]), cells.map((c) => c[1])];
  return { cells: cells.length, across: (Math.max(...is) - Math.min(...is) + 1) * CELL_FT, deep: (Math.max(...js) - Math.min(...js) + 1) * CELL_FT };
}

// What kind of slab it is, by how it lies, and its surface.
export function slabKind(slab) {
  const pitch = Math.abs(slab.turn[1]);
  const lies = pitch < 1 ? "floor" : Math.abs(pitch - 90) < 1 ? "wall" : "roof";
  return `${lies} (${slab.surface})`;
}

// The kinds whose counts differ from `before` to `after`, as [{ label, before, after }], objects
// named by nameOf(type), then slabs; and both footprints.
export function templateDiff(before, after, nameOf = (type) => type) {
  const counts = (template) => {
    const out = new Map();
    for (const o of template.objects) out.set(nameOf(o.type), (out.get(nameOf(o.type)) ?? 0) + 1);
    for (const s of template.slabs) out.set(slabKind(s), (out.get(slabKind(s)) ?? 0) + 1);
    return out;
  };
  const [was, now] = [counts(before), counts(after)];
  const labels = [...new Set([...was.keys(), ...now.keys()])];
  const changes = labels.map((label) => ({ label, before: was.get(label) ?? 0, after: now.get(label) ?? 0 })).filter((c) => c.before !== c.after);
  return { changes, before: footprint(before), after: footprint(after) };
}
