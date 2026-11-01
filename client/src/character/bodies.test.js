import { afterEach, describe, expect, it } from "vitest";
import { BODIES, SHIPPED_BODIES, useModels } from "./bodies.js";
import { SKELETONS } from "./frames.js";
import { colorationProblems, marked, painter } from "./paint.js";
import { resolveRecipe } from "./recipe.js";

describe("shipped bodies", () => {
  it("fill every color their patterns use, ten at most, from patterns they have", () => {
    for (const [name, body] of Object.entries(SHIPPED_BODIES)) expect(colorationProblems(body.colorations, body.patterns), name).toEqual([]);
  });
});

describe("useModels", () => {
  afterEach(() => useModels());
  const tiger = SHIPPED_BODIES.tiger;

  it("puts a world's own body over the shipped one of its name, keeping the shipped one as core:", () => {
    useModels({ bodies: { tiger: { ...tiger, shape: { ...tiger.shape, head: 3 } }, gremlin: { ...SHIPPED_BODIES.wolf, scale: 0.5 } } });
    expect(BODIES.tiger.custom).toBe(true);
    expect(BODIES["core:tiger"]).toEqual(tiger);
    expect(SKELETONS.feline).toContain("tiger");
    expect(SKELETONS.feline).not.toContain("core:tiger");
    expect(SKELETONS.canine).toContain("gremlin");
    expect(resolveRecipe({ body: "gremlin" }).height).toBeGreaterThan(0);
    useModels();
    expect(BODIES.gremlin).toBeUndefined();
  });

  it("adds a world's patterns and colorations to a shipped body", () => {
    const pattern = { areas: { everything: "coat", eyes: "eyes" } };
    useModels({ colorations: { tiger: { patterns: { plain: pattern }, colorations: [{ name: "ghost", pattern: "plain", colors: { coat: "#ffffff", eyes: "#80b0d0" } }] } } });
    expect(BODIES.tiger.colorations.map((c) => c.name)).toEqual([...tiger.colorations.map((c) => c.name), "ghost"]);
    expect(resolveRecipe({ body: "tiger", coloration: "ghost" }).coloration).toBe("ghost");
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
