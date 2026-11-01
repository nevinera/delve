import { describe, expect, it } from "vitest";
import { SHIPPED_BODIES } from "./bodies.js";
import { marked, painter } from "./paint.js";

// The color names a pattern's rules use.
function used(pattern) {
  const names = new Set();
  for (const rule of Object.values(pattern.areas)) {
    if (typeof rule === "string") names.add(rule);
    else {
      if (rule.color) names.add(rule.color);
      for (const mark of rule.marks ?? []) names.add(mark.color);
    }
  }
  return [...names].filter((n) => !n.startsWith("#"));
}

describe("shipped bodies", () => {
  it("fill every color their patterns use, ten at most, from patterns they have", () => {
    for (const [name, body] of Object.entries(SHIPPED_BODIES)) {
      for (const coloration of body.colorations ?? []) {
        const pattern = body.patterns?.[coloration.pattern];
        expect(pattern, `${name} ${coloration.name}`).toBeTruthy();
        const colors = { ...pattern.colors, ...coloration.colors };
        for (const color of used(pattern)) expect(colors[color], `${name} ${coloration.name} ${color}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(Object.keys(colors).length, `${name} ${coloration.name}`).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe("painter", () => {
  const groups = { body: ["coat", "belly"], everything: ["body", "eyes"] };
  const paint = painter({ pattern: { areas: { everything: "base", belly: "pale" } }, colors: { base: "#ff0000", pale: "#ffffff" }, groups });

  it("paints an area by its own rule, or its smallest group's", () => {
    expect(paint("belly", [0, 0, 0])).toEqual([1, 1, 1]);
    expect(paint("coat", [0, 0, 0])).toEqual([1, 0, 0]);
    expect(paint("eyes", [0, 0, 0])).toEqual([1, 0, 0]);
  });

  it("darkens by the tone a tag carries", () => {
    expect(paint("coat@0.5", [0, 0, 0])).toEqual([0.5, 0, 0]);
  });

  it("lays stripes their width apart", () => {
    const stripe = { kind: "stripes", width: 0.1, gap: 0.1, wave: 0 };
    expect(marked(stripe, [0, 0, 0.05])).toBe(true);
    expect(marked(stripe, [0, 0, 0.15])).toBe(false);
    expect(marked(stripe, [0, 0, 0.25])).toBe(true);
  });
});
