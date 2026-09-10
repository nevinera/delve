import {describe, it, expect, vi} from "vitest";
import {resolveReferences} from "../resolveReferences";

describe("resolveReferences", () => {
  it("returns primitives and reference-free objects unchanged", async () => {
    const data = {name: "Punch", castTime: null, globalCooldown: 1.5, tags: ["melee"]};

    expect(await resolveReferences(data, vi.fn())).toEqual(data);
  });

  it("replaces a top-level AssetReference with the looked-up content", async () => {
    const lookup = vi.fn().mockResolvedValue({name: "Punch"});

    const result = await resolveReferences({$ref: "../abilities/punch.json", referenceTo: "power"}, lookup);

    expect(result).toEqual({name: "Punch"});
    expect(lookup).toHaveBeenCalledWith("../abilities/punch.json", "power");
  });

  it("resolves a reference nested inside an array", async () => {
    const lookup = vi.fn().mockResolvedValue({name: "Punch"});
    const data = {powers: [{$ref: "../abilities/punch.json", referenceTo: "power"}]};

    const result = await resolveReferences(data, lookup);

    expect(result).toEqual({powers: [{name: "Punch"}]});
  });

  it("resolves a reference nested inside an object", async () => {
    const lookup = vi.fn().mockResolvedValue({name: "Main Chamber"});
    const data = {maps: {entrance: {$ref: "../maps/main-chamber.json", referenceTo: "map"}}};

    const result = await resolveReferences(data, lookup);

    expect(result).toEqual({maps: {entrance: {name: "Main Chamber"}}});
  });

  it("recursively resolves a reference whose own content contains further references", async () => {
    const lookup = vi.fn()
      .mockResolvedValueOnce({name: "Zone", powers: [{$ref: "../abilities/punch.json", referenceTo: "power"}]})
      .mockResolvedValueOnce({name: "Punch"});

    const result = await resolveReferences({$ref: "../zones/cave.json", referenceTo: "zone"}, lookup);

    expect(result).toEqual({name: "Zone", powers: [{name: "Punch"}]});
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("resolves multiple independent references, each with the reference-specific lookup args", async () => {
    const lookup = vi.fn((ref) => Promise.resolve({name: ref}));
    const data = {a: {$ref: "a.json", referenceTo: "power"}, b: {$ref: "b.json", referenceTo: "power"}};

    const result = await resolveReferences(data, lookup);

    expect(result).toEqual({a: {name: "a.json"}, b: {name: "b.json"}});
  });

  it("doesn't mutate the original input", async () => {
    const original = {powers: [{$ref: "../abilities/punch.json", referenceTo: "power"}]};
    const snapshot = JSON.parse(JSON.stringify(original));

    await resolveReferences(original, vi.fn().mockResolvedValue({name: "Punch"}));

    expect(original).toEqual(snapshot);
  });
});
