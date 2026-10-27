import { describe, expect, it } from "vitest";
import { BUILTIN_STRUCTURES } from "./builtinStructures.js";
import { setBuiltObjects, specOf } from "./objects.js";
import { problems } from "./structures.js";

describe("builtin structures", () => {
  it("are all sound, with unique ids, furnished only with builtin objects", () => {
    setBuiltObjects([]);
    const ids = new Set();
    for (const s of BUILTIN_STRUCTURES) {
      expect(problems(s), s.name).toEqual([]);
      expect(s.id, s.name).toMatch(/^b[0-9a-z]{7}$/);
      expect(ids.has(s.id), s.id).toBe(false);
      ids.add(s.id);
      for (const o of s.objects) expect(specOf(o.type)?.built, `${s.name}: ${o.name}`).toBeTruthy();
      expect(specOf(`structure:${s.id}`)?.structure, s.name).toBe(s);
    }
  });

  it("dig in only where a ramp or stair comes down from the surface", () => {
    const opens = Object.fromEntries(BUILTIN_STRUCTURES.filter((s) => s.walk.cut.length).map((s) => [s.name, s.walk.cut.length]));
    expect(opens).toEqual({ "mine entrance": 8, "small cave": 8, "large cave": 8, crypt: 2 });
  });
});
