import {describe, it, expect, vi} from "vitest";
import {loadWorld, loadLayoutPositions, zoneDetailsFor, listAvailableZoneKeys, zoneRefPath} from "../worldContentLoaders";

function fakeClient(filesByPath) {
  return {fetchFile: vi.fn(async (path) => (path in filesByPath ? filesByPath[path] : null))};
}

describe("loadWorld", () => {
  it("parses the fetched file when it exists", async () => {
    const client = fakeClient({"worlds/northern-barrens.json": JSON.stringify({name: "Northern Barrens"})});
    const data = await loadWorld(client, "northern-barrens");
    expect(data.name).toBe("Northern Barrens");
  });

  it("falls back to a blank world when the file doesn't exist yet", async () => {
    const client = fakeClient({});
    const data = await loadWorld(client, "new_world");
    expect(data.name).toBe("New World");
    expect(data.zones).toEqual({});
  });
});

describe("loadLayoutPositions", () => {
  it("parses the persisted positions when the layout file exists", async () => {
    const client = fakeClient({"worlds/northern-barrens.layout.json": JSON.stringify({positions: {goblin_cave: {x: 10, y: 20}}})});
    const positions = await loadLayoutPositions(client, "northern-barrens");
    expect(positions).toEqual({goblin_cave: {x: 10, y: 20}});
  });

  it("defaults to {} when no layout file has ever been saved", async () => {
    const client = fakeClient({});
    expect(await loadLayoutPositions(client, "northern-barrens")).toEqual({});
  });

  it("defaults to {} when the layout file has no positions key", async () => {
    const client = fakeClient({"worlds/northern-barrens.layout.json": JSON.stringify({})});
    expect(await loadLayoutPositions(client, "northern-barrens")).toEqual({});
  });
});

describe("zoneDetailsFor", () => {
  it("resolves each zone's relative path against the world's own file and returns its name/openConnections/entryPoints", async () => {
    const client = fakeClient({
      "zones/goblin-cave.json": JSON.stringify({
        name: "Goblin Cave",
        openConnections: {"cave_entrance/back_door": "cliff_above"},
        entryPoints: {"cave_entrance/cave_mouth": null},
      }),
    });
    const zones = {goblin_cave: {path: "../zones/goblin-cave.json", name: "Goblin Cave"}};

    const details = await zoneDetailsFor(client, "northern-barrens", zones);

    expect(details).toEqual({
      goblin_cave: {
        name: "Goblin Cave",
        openConnections: {"cave_entrance/back_door": "cliff_above"},
        entryPoints: {"cave_entrance/cave_mouth": null},
      },
    });
  });

  it("omits a zone with no path", async () => {
    const client = fakeClient({});
    const details = await zoneDetailsFor(client, "northern-barrens", {broken: {}});
    expect(details).toEqual({});
  });

  it("omits a zone whose file doesn't exist (404 -> null)", async () => {
    const client = fakeClient({});
    const details = await zoneDetailsFor(client, "northern-barrens", {goblin_cave: {path: "../zones/goblin-cave.json"}});
    expect(details).toEqual({});
  });

  it("omits a zone whose fetch throws", async () => {
    const client = {fetchFile: vi.fn().mockRejectedValue(new Error("network down"))};
    const details = await zoneDetailsFor(client, "northern-barrens", {goblin_cave: {path: "../zones/goblin-cave.json"}});
    expect(details).toEqual({});
  });

  it("defaults openConnections/entryPoints to {} when the zone doesn't have any", async () => {
    const client = fakeClient({"zones/goblin-cave.json": JSON.stringify({name: "Goblin Cave"})});
    const details = await zoneDetailsFor(client, "northern-barrens", {goblin_cave: {path: "../zones/goblin-cave.json"}});
    expect(details).toEqual({goblin_cave: {name: "Goblin Cave", openConnections: {}, entryPoints: {}}});
  });
});

describe("listAvailableZoneKeys", () => {
  it("returns each zone's own key, deduplicated and sorted, excluding deeper map/layout/full files", async () => {
    const client = {
      listDirectory: vi.fn().mockResolvedValue([
        "zones/goblin_cave/goblin_cave.json",
        "zones/goblin_cave/goblin_cave.full.json",
        "zones/goblin_cave/goblin_cave.layout.json",
        "zones/goblin_cave/entrance_tunnel/entrance_tunnel.json",
        "zones/stagnant_oasis/stagnant_oasis.json",
      ]),
    };

    const keys = await listAvailableZoneKeys(client);

    expect(keys).toEqual(["goblin_cave", "stagnant_oasis"]);
    expect(client.listDirectory).toHaveBeenCalledWith("zones");
  });

  it("returns an empty array when there are no zones yet", async () => {
    const client = {listDirectory: vi.fn().mockResolvedValue([])};
    expect(await listAvailableZoneKeys(client)).toEqual([]);
  });
});

describe("zoneRefPath", () => {
  it("computes the deterministic relative path from a world file to a zone's own file", () => {
    expect(zoneRefPath("goblin_cave")).toBe("../zones/goblin_cave/goblin_cave.json");
  });
});
