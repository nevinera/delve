import {describe, it, expect, vi, beforeEach} from "vitest";
import {resolveZoneRefs} from "../resolveZoneRefs";
import {fetchFilesBatch} from "../../github/fetchFilesBatch";

vi.mock("../../github/fetchFilesBatch", () => ({
  fetchFilesBatch: vi.fn(),
}));

describe("resolveZoneRefs", () => {
  beforeEach(() => {
    fetchFilesBatch.mockReset();
  });

  it("returns an equivalent zone unchanged when there's nothing to resolve", async () => {
    const zone = {name: "Small Cave", maps: [], zoneLinks: []};
    const result = await resolveZoneRefs(zone, "zones/small-cave");

    expect(result).toEqual(zone);
    expect(fetchFilesBatch).not.toHaveBeenCalled();
  });

  it("does not mutate the input zone", async () => {
    const zone = {maps: [{$ref: "./sc1-small-cave/sc1-small-cave.json", referenceTo: "map"}]};
    fetchFilesBatch.mockResolvedValue({"zones/small-cave/sc1-small-cave/sc1-small-cave.json": '{"identifier":"small_cave"}'});

    await resolveZoneRefs(zone, "zones/small-cave");

    expect(zone.maps[0]).toEqual({$ref: "./sc1-small-cave/sc1-small-cave.json", referenceTo: "map"});
  });

  it("resolves a map $ref relative to the zone's own directory", async () => {
    const zone = {maps: [{$ref: "./sc1-small-cave/sc1-small-cave.json", referenceTo: "map"}]};
    fetchFilesBatch.mockResolvedValue({
      "zones/small-cave/sc1-small-cave/sc1-small-cave.json": '{"identifier":"small_cave","name":"Small Cave"}',
    });

    const result = await resolveZoneRefs(zone, "zones/small-cave");

    expect(fetchFilesBatch).toHaveBeenCalledWith(["zones/small-cave/sc1-small-cave/sc1-small-cave.json"]);
    expect(result.maps[0]).toEqual({identifier: "small_cave", name: "Small Cave"});
  });

  it("resolves a unitType $ref with ../.. segments, matching real content's convention", async () => {
    const zone = {unitTypes: {goblin: {$ref: "../../unit_types/goblin.json", referenceTo: "unit_type"}}};
    fetchFilesBatch.mockResolvedValue({"unit_types/goblin.json": '{"name":"Goblin"}'});

    const result = await resolveZoneRefs(zone, "zones/goblin-cave");

    expect(fetchFilesBatch).toHaveBeenCalledWith(["unit_types/goblin.json"]);
    expect(result.unitTypes.goblin).toEqual({name: "Goblin"});
  });

  it("batches every ref at the same depth into a single fetchFilesBatch call", async () => {
    const zone = {
      maps: [
        {$ref: "./gc1/gc1.json", referenceTo: "map"},
        {$ref: "./gc2/gc2.json", referenceTo: "map"},
      ],
    };
    fetchFilesBatch.mockResolvedValue({
      "zones/goblin-cave/gc1/gc1.json": '{"identifier":"gc1"}',
      "zones/goblin-cave/gc2/gc2.json": '{"identifier":"gc2"}',
    });

    await resolveZoneRefs(zone, "zones/goblin-cave");

    expect(fetchFilesBatch).toHaveBeenCalledTimes(1);
    expect(fetchFilesBatch).toHaveBeenCalledWith(["zones/goblin-cave/gc1/gc1.json", "zones/goblin-cave/gc2/gc2.json"]);
  });

  it("recursively resolves a $ref found inside a just-resolved file, relative to *its* directory", async () => {
    const zone = {unitTypes: {goblin: {$ref: "../../unit_types/goblin.json", referenceTo: "unit_type"}}};
    fetchFilesBatch
      .mockResolvedValueOnce({"unit_types/goblin.json": '{"name":"Goblin","powers":[{"$ref":"../abilities/units/goblins/enrage.json","referenceTo":"ability"}]}'})
      .mockResolvedValueOnce({"abilities/units/goblins/enrage.json": '{"name":"Enrage"}'});

    const result = await resolveZoneRefs(zone, "zones/goblin-cave");

    expect(fetchFilesBatch).toHaveBeenNthCalledWith(1, ["unit_types/goblin.json"]);
    expect(fetchFilesBatch).toHaveBeenNthCalledWith(2, ["abilities/units/goblins/enrage.json"]);
    expect(result.unitTypes.goblin).toEqual({name: "Goblin", powers: [{name: "Enrage"}]});
  });

  it("rebases a map's own-directory-relative imageUrl/thumbnailUrl into the zone's directory", async () => {
    const zone = {maps: [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}]};
    fetchFilesBatch.mockResolvedValue({
      "zones/goblin-cave/gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json":
        '{"identifier":"gc1","imageUrl":"./gc1-goblin-cave-entrance.webp","thumbnailUrl":"gc1-goblin-cave-entrance.thumb.webp"}',
    });

    const result = await resolveZoneRefs(zone, "zones/goblin-cave");

    expect(result.maps[0]).toEqual({
      identifier: "gc1",
      imageUrl: "gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.webp",
      thumbnailUrl: "gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.thumb.webp",
    });
  });

  it("rebases a unit type's tokenImageUrl (one directory shallower than the zone) with extra ../", async () => {
    const zone = {unitTypes: {goblin: {$ref: "../../unit_types/goblin.json", referenceTo: "unit_type"}}};
    fetchFilesBatch.mockResolvedValue({
      "unit_types/goblin.json": '{"name":"Goblin","tokenImageUrl":["../tokens/unit/goblin-1.webp"]}',
    });

    const result = await resolveZoneRefs(zone, "zones/goblin-cave");

    expect(result.unitTypes.goblin.tokenImageUrl).toEqual(["../../tokens/unit/goblin-1.webp"]);
  });

  it("rebases a nested ability's sourceURL through two levels of $ref (unit type, then power)", async () => {
    const zone = {unitTypes: {goblin: {$ref: "../../unit_types/goblin.json", referenceTo: "unit_type"}}};
    fetchFilesBatch
      .mockResolvedValueOnce({"unit_types/goblin.json": '{"name":"Goblin","powers":[{"$ref":"../abilities/units/goblins/enrage.json","referenceTo":"ability"}]}'})
      .mockResolvedValueOnce({"abilities/units/goblins/enrage.json": '{"name":"Enrage","soundEffects":[{"sourceURL":"../../../audio/whoomph.ogg"}]}'});

    const result = await resolveZoneRefs(zone, "zones/goblin-cave");

    expect(result.unitTypes.goblin.powers[0].soundEffects[0].sourceURL).toBe("../../audio/whoomph.ogg");
  });

  it("throws a clear error when a $ref target doesn't exist", async () => {
    const zone = {maps: [{$ref: "./missing/missing.json", referenceTo: "map"}]};
    fetchFilesBatch.mockResolvedValue({"zones/goblin-cave/missing/missing.json": null});

    await expect(resolveZoneRefs(zone, "zones/goblin-cave")).rejects.toThrow(/Could not resolve \$ref.*missing/);
  });
});
