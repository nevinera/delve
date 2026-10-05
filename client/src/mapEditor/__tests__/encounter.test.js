import {describe, it, expect} from "vitest";
import {buildEncounter, scatterPositions} from "../encounter";

// A deterministic stand-in for Math.random.
function seeded(seed = 1) {
  let s = (seed * 7919 + 104729) % 2147483647;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const goblins = [
  {key: "goblin-cutter", tags: ["open", "group", "melee"]},
  {key: "goblin-archer", tags: ["open", "group", "ranged", "glass"]},
  {key: "goblin-mender", tags: ["open", "group", "caster", "healer"]},
  {key: "goblin-boss", tags: ["open", "group", "melee", "tough", "buffs"]},
];
const tagsOf = (key, list) => list.find((c) => c.key === key).tags;

describe("buildEncounter", () => {
  it("fills a group encounter with 3-4 group units", () => {
    for (let seed = 1; seed < 40; seed++) {
      const {keys} = buildEncounter({candidates: goblins, intendedFor: "open", pullSize: "group", random: seeded(seed)});
      expect(keys.length).toBeGreaterThanOrEqual(3);
      expect(keys.length).toBeLessThanOrEqual(4);
    }
  });

  it("caps healers and leaders at one each, and always includes a melee unit", () => {
    for (let seed = 1; seed < 60; seed++) {
      const {keys} = buildEncounter({candidates: goblins, intendedFor: "open", pullSize: "group", random: seeded(seed)});
      expect(keys.filter((k) => k === "goblin-mender").length).toBeLessThanOrEqual(1);
      expect(keys.filter((k) => k === "goblin-boss").length).toBeLessThanOrEqual(1);
      expect(keys.some((k) => tagsOf(k, goblins).includes("melee"))).toBe(true);
    }
  });

  it("only uses units tagged with the chosen intended-for", () => {
    const candidates = [...goblins, {key: "dungeon-goblin", tags: ["g1", "group", "melee"]}];
    for (let seed = 1; seed < 30; seed++) {
      const {keys} = buildEncounter({candidates, intendedFor: "open", pullSize: "group", random: seeded(seed)});
      expect(keys).not.toContain("dungeon-goblin");
    }
  });

  it("substitutes smaller units (two group for a pair), never bigger ones", () => {
    const candidates = [
      {key: "wolf", tags: ["open", "group", "melee"]},
      {key: "worg", tags: ["open", "pair", "melee"]},
      {key: "tiger", tags: ["open", "solo", "melee"]},
    ];
    const seen = new Set();
    for (let seed = 1; seed < 80; seed++) {
      const {keys} = buildEncounter({candidates, intendedFor: "open", pullSize: "pair", random: seeded(seed)});
      expect(keys).not.toContain("tiger");
      const points = keys.reduce((sum, k) => sum + (k === "worg" ? 4 : 2), 0);
      expect(points).toBe(8);
      seen.add(keys.slice().sort().join(","));
    }
    expect(seen.has("worg,worg")).toBe(true);
    expect([...seen].some((combo) => combo.includes("wolf"))).toBe(true);
  });

  it("refuses an all-ranged pull", () => {
    const candidates = [{key: "archer", tags: ["open", "group", "ranged"]}];
    expect(buildEncounter({candidates, intendedFor: "open", pullSize: "group", random: seeded()}).error)
      .toMatch(/needs at least one melee unit/);
  });

  it("explains when nothing fits", () => {
    expect(buildEncounter({candidates: goblins, intendedFor: "g5", pullSize: "group"}).error).toMatch(/No g5 unit types/);
  });
});

describe("scatterPositions", () => {
  it("keeps small units within 10ft of the point, spread out, facing randomly", () => {
    const positions = scatterPositions({x: 50, y: 50}, [1.75, 1.75, 1.75, 1.75], seeded());
    for (const p of positions) {
      expect(Math.hypot(p.x - 50, p.y - 50)).toBeLessThanOrEqual(10);
      expect(p.angle).toBeGreaterThanOrEqual(0);
      expect(p.angle).toBeLessThanOrEqual(360);
    }
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y)).toBeGreaterThanOrEqual(3.5);
      }
    }
  });

  it("widens the cluster rather than overlap big tokens", () => {
    const positions = scatterPositions({x: 0, y: 0}, [5, 5, 5], seeded());
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y)).toBeGreaterThanOrEqual(9.5);
      }
    }
  });

  it("puts a single unit on the point", () => {
    expect(scatterPositions({x: 3, y: 4}, [2], seeded())[0]).toMatchObject({x: 3, y: 4});
  });
});

describe("buildEncounter with a random pull size", () => {
  const mixed = [
    {key: "wolf", tags: ["open", "group", "melee"]},
    {key: "worg", tags: ["open", "pair", "melee"]},
  ];

  it("picks among the sizes the candidates have, never others", () => {
    const sizes = new Set();
    for (let seed = 1; seed < 60; seed++) {
      const result = buildEncounter({candidates: mixed, intendedFor: "open", pullSize: "random", random: seeded(seed)});
      expect(result.error).toBeUndefined();
      sizes.add(result.pullSize);
    }
    expect([...sizes].sort()).toEqual(["group", "pair"]);
  });

  it("falls back to another size when one can't build", () => {
    const candidates = [
      {key: "archer", tags: ["open", "group", "ranged"]},
      {key: "tiger", tags: ["open", "solo", "melee"]},
    ];
    for (let seed = 1; seed < 20; seed++) {
      const result = buildEncounter({candidates, intendedFor: "open", pullSize: "random", random: seeded(seed)});
      expect(result.pullSize).toBe("solo");
    }
  });
});
