import {describe, it, expect, vi} from "vitest";
import {loadZone, loadLayoutPositions, listZoneMapKeys, referencedMapKeys, mapDetailsFor} from "../zoneContentLoaders";

function fakeClient({files = {}, dirs = {}, assetUrls = {}} = {}) {
  return {
    fetchFile: vi.fn((path) => Promise.resolve(path in files ? files[path] : null)),
    listDirectory: vi.fn((path) => Promise.resolve(dirs[path] ?? [])),
    assetUrl: vi.fn((path) => Promise.resolve(assetUrls[path] ?? path)),
  };
}

describe("loadZone", () => {
  it("fetches the zone at zones/<key>/<basename>.json and parses it", async () => {
    const client = fakeClient({files: {"zones/goblin-cave/goblin-cave.json": JSON.stringify({name: "Goblin Cave"})}});

    expect(await loadZone(client, "goblin-cave")).toEqual({name: "Goblin Cave"});
  });

  it("falls back to a blank zone on a 404 (null)", async () => {
    const client = fakeClient();

    const result = await loadZone(client, "darkwood");

    expect(result).toMatchObject({name: "Darkwood", maps: [], unitTypes: {}, items: {}, zoneLinks: [], entryPoints: {}, openConnections: {}});
  });
});

describe("loadLayoutPositions", () => {
  it("returns {} when the layout file doesn't exist", async () => {
    const client = fakeClient();

    expect(await loadLayoutPositions(client, "goblin-cave")).toEqual({});
  });

  it("parses the positions map when the file exists", async () => {
    const client = fakeClient({
      files: {"zones/goblin-cave/goblin-cave.layout.json": JSON.stringify({positions: {"gc1-entrance": {x: 12.5, y: -8}}})},
    });

    expect(await loadLayoutPositions(client, "goblin-cave")).toEqual({"gc1-entrance": {x: 12.5, y: -8}});
  });
});

describe("listZoneMapKeys", () => {
  it("returns only map files (one level deep), not the zone's own json", async () => {
    const client = fakeClient({
      dirs: {
        "zones/goblin-cave": [
          "zones/goblin-cave/goblin-cave.json",
          "zones/goblin-cave/goblin-cave.full.json",
          "zones/goblin-cave/gc1-entrance/gc1-entrance.json",
          "zones/goblin-cave/gc1-entrance/gc1-entrance.webp",
        ],
      },
    });

    const result = await listZoneMapKeys(client, "goblin-cave");

    expect(result).toEqual(["gc1-entrance"]);
  });

  it("returns an empty array for a zone directory that doesn't exist yet", async () => {
    const client = fakeClient();

    expect(await listZoneMapKeys(client, "darkwood")).toEqual([]);
  });
});

describe("referencedMapKeys", () => {
  it("extracts keys from $ref entries in zoneData.maps", () => {
    const zoneData = {maps: [{$ref: "./gc1-entrance/gc1-entrance.json", referenceTo: "map"}]};

    expect(referencedMapKeys(zoneData)).toEqual(["gc1-entrance"]);
  });

  it("ignores an inline (non-$ref) map entry", () => {
    expect(referencedMapKeys({maps: [{identifier: "inline-map"}]})).toEqual([]);
  });

  it("returns an empty array when there are no maps yet", () => {
    expect(referencedMapKeys({})).toEqual([]);
  });
});

describe("mapDetailsFor", () => {
  it("returns identifier/name/connections/units for each key", async () => {
    const client = fakeClient({
      files: {
        "zones/goblin-cave/gc1-entrance/gc1-entrance.json": JSON.stringify({
          identifier: "cave_entrance", name: "Cave Entrance",
          connections: [{identifier: "cave_mouth", type: "line"}],
          units: [{unitType: "goblin_raider", lootTable: {"sword-of-doom": 10}}],
        }),
      },
    });

    const result = await mapDetailsFor(client, "goblin-cave", ["gc1-entrance"]);

    expect(result).toEqual({
      "gc1-entrance": {
        identifier: "cave_entrance", name: "Cave Entrance",
        connections: [{identifier: "cave_mouth", type: "line"}],
        units: [{unitType: "goblin_raider", itemKeys: ["sword-of-doom"]}],
        thumbnailUrl: null,
      },
    });
  });

  it("resolves thumbnailUrl relative to the map's own file", async () => {
    const client = fakeClient({
      files: {"zones/goblin-cave/gc1-entrance/gc1-entrance.json": JSON.stringify({identifier: "cave_entrance", name: "Cave Entrance", thumbnailUrl: "gc1-entrance.thumb.webp"})},
      assetUrls: {"zones/goblin-cave/gc1-entrance/gc1-entrance.thumb.webp": "https://raw.example/gc1-entrance.thumb.webp"},
    });

    const result = await mapDetailsFor(client, "goblin-cave", ["gc1-entrance"]);

    expect(result["gc1-entrance"].thumbnailUrl).toBe("https://raw.example/gc1-entrance.thumb.webp");
  });

  it("omits a key whose file no longer exists, rather than erroring", async () => {
    const client = fakeClient();

    expect(await mapDetailsFor(client, "goblin-cave", ["deleted-map"])).toEqual({});
  });
});
