import { BODIES } from "./bodies.js";
import { hashAt } from "./body.js";
import { hex, shade } from "./rig.js";

// Colorations (docs/formats/bodies.md): a builder tags each face it makes with an area of the
// body ("coat", "belly", "eyes"), or an area and a tone it always has there ("shins@0.85"), and a
// painter turns the tag and where the face sits into a color, by the pattern's rules and the
// coloration's colors.
//
// A pattern's `areas` holds a rule for areas and groups of them (the skeleton's, the body's and
// the pattern's own `groups`, each a list of areas and other groups). An area takes its own rule,
// or else the rule of the smallest group holding it that has one. A rule is a color's name, or
// { color, tone, shade, marks }: tone lightens or darkens it, shade wobbles each face's lightness
// by up to that much, and marks paint over it where they fall (see `marked`).

const GREY = [0.5, 0.5, 0.5];
const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

// Every area a group holds, through the groups it holds.
function expand(groups, name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  return (groups[name] ?? []).flatMap((part) => (part in groups ? expand(groups, part, seen) : [part]));
}

// `unit`: how big the body is, in the units the builder places faces in, so mark sizes go with
// the body; `seed`: which way marks fall, so no two creatures' stripes are quite alike.
export function painter({ pattern, colors = {}, groups = {}, unit = 1, seed = 0 }) {
  const named = Object.fromEntries(Object.entries(colors).filter(([, v]) => isHex(v)).map(([k, v]) => [k, hex(v)]));
  const colorOf = (name) => (isHex(name) ? hex(name) : (named[name] ?? GREY));
  const rules = pattern?.areas ?? {};
  const all = { ...groups, ...pattern?.groups };
  const holding = Object.keys(all)
    .filter((name) => rules[name] !== undefined)
    .map((name) => [name, new Set(expand(all, name))])
    .sort((a, b) => a[1].size - b[1].size);
  const ruleOf = new Map();
  const rule = (area) => {
    if (!ruleOf.has(area)) {
      // With no rule, an area takes the color of its own name.
      const found = rules[area] ?? rules[holding.find(([, areas]) => areas.has(area))?.[0]] ?? area;
      ruleOf.set(area, typeof found === "string" ? { color: found } : found);
    }
    return ruleOf.get(area);
  };
  const tags = new Map();
  return (tag, at) => {
    if (!tags.has(tag)) {
      const [area, tone] = tag.split("@");
      tags.set(tag, { area, tone: tone ? Number(tone) : 1 });
    }
    const { area, tone: given } = tags.get(tag);
    const r = rule(area);
    let color = colorOf(r.color);
    let tone = (r.tone ?? 1) * given;
    for (const mark of r.marks ?? []) {
      if (!marked(mark, at, unit, seed)) continue;
      color = colorOf(mark.color);
      tone *= mark.tone ?? 1;
    }
    if (r.shade) tone *= 1 + r.shade * (2 * hashAt(at, seed + 5) - 1);
    return shade(color, tone);
  };
}

// The painter for a look: its body's coloration (look.coloration, or the body's first), its
// pattern's default colors under the coloration's, and the look's own `paints` over both, all over
// `base` colors (a humanoid look's own, for the areas a coloration leaves be).
export function painterFor(look, groups, unit, base = {}) {
  const body = BODIES[look.body] ?? {};
  const colorations = body.colorations ?? [];
  const coloration = colorations.find((c) => c.name === look.coloration) ?? colorations[0];
  const pattern = body.patterns?.[coloration?.pattern];
  const colors = { ...base, ...pattern?.colors, ...coloration?.colors, ...look.paints };
  return painter({ pattern, colors, groups: { ...groups, ...body.groups }, unit, seed: Math.round((look.height ?? 1) * 1000) });
}

// The color names a pattern's rules use.
export function patternColors(pattern) {
  const names = new Set();
  for (const rule of Object.values(pattern?.areas ?? {})) {
    if (typeof rule === "string") names.add(rule);
    else if (rule && typeof rule === "object") {
      if (rule.color) names.add(rule.color);
      for (const mark of rule.marks ?? []) names.add(mark?.color);
    }
  }
  return [...names].filter((n) => typeof n === "string" && !isHex(n));
}

// What's wrong with a body's colorations, each filling the colors its pattern uses, ten at most,
// from `patterns` (the body's, by default).
export function colorationProblems(colorations, patterns) {
  const out = [];
  if (!Array.isArray(colorations)) return ["needs colorations as a list"];
  for (const coloration of colorations) {
    const name = JSON.stringify(coloration?.name);
    if (typeof coloration?.name !== "string" || !coloration.name) out.push("has a coloration with no name");
    const pattern = patterns?.[coloration?.pattern];
    if (!pattern) {
      out.push(`has coloration ${name} with pattern ${JSON.stringify(coloration?.pattern)}, which it doesn't have`);
      continue;
    }
    const colors = { ...pattern.colors, ...coloration.colors };
    for (const color of patternColors(pattern)) if (!isHex(colors[color])) out.push(`has coloration ${name}, which doesn't fill ${color} with a "#rrggbb" color`);
    if (Object.keys(colors).length > 10) out.push(`has coloration ${name} with more than 10 colors`);
  }
  return out;
}

// Whether a mark falls on a face at `at`. Sizes are shares of the body's size.
// - speckled: single faces, `amount` of them (0-1).
// - spots and patches: blobs `size` across, `amount` of the body covered.
// - stripes: `width` wide with `gap` between, `across` the body ("vertical", up and down it;
//   "horizontal", along it, which rings the legs; or "diagonal"), wavering by `wave` and with
//   `break` of each broken off.
export function marked(mark, at, unit = 1, seed = 0) {
  const [x, y, z] = at;
  if (mark.kind === "speckled") return hashAt(at, seed + 7) < (mark.amount ?? 0.2);
  if (mark.kind === "spots" || mark.kind === "patches") {
    const size = (mark.size ?? (mark.kind === "spots" ? 0.08 : 0.3)) * unit;
    // Cells offset by the seed, so the blobs don't line up between creatures.
    const cell = [x, y, z].map((v, i) => Math.floor(v / size + hashAt([seed, i], 3)));
    return hashAt(cell, seed + 11) < (mark.amount ?? (mark.kind === "spots" ? 0.3 : 0.45));
  }
  if (mark.kind === "stripes") {
    const width = (mark.width ?? 0.05) * unit;
    const period = width + (mark.gap ?? mark.width ?? 0.05) * unit;
    const across = mark.across ?? "vertical";
    const [along, other] = across === "horizontal" ? [y, z] : across === "diagonal" ? [z + y, x] : [z, y];
    const wave = (mark.wave ?? 0.3) * period * Math.sin((other / period) * 1.7 + seed);
    const phase = (along + wave) / period;
    const band = Math.floor(phase);
    if (phase - band >= width / period) return false;
    return hashAt([band, Math.round(other / period)], seed + 13) >= (mark.break ?? 0);
  }
  return false;
}
