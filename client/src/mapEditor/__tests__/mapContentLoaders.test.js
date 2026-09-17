import {describe, it, expect, vi} from "vitest";
import {loadMap, loadMapImageUrl, listUnitTypeKeys, unitTypeDetailsFor, listItemKeys, itemDetailsFor} from "../mapContentLoaders";

function fakeClient({files = {}, dirs = {}, assetUrls = {}} = {}) {
  return {
    fetchFile: vi.fn((path) => Promise.resolve(path in files ? files[path] : null)),
    listDirectory: vi.fn((path) => Promise.resolve(dirs[path] ?? [])),
    assetUrl: vi.fn((path) => Promise.resolve(assetUrls[path] ?? path)),
  };
}

describe("loadMap", () => {
  it("fetches the map at zones/<key>/<basename>.json and parses it", async () => {
    const client = fakeClient({files: {"zones/goblin-cave/gc1-entrance/gc1-entrance.json": JSON.stringify({name: "Gc1 Entrance"})}});

    const result = await loadMap(client, "goblin-cave/gc1-entrance");

    expect(result).toEqual({name: "Gc1 Entrance"});
  });

  it("falls back to a blank map on a 404 (null)", async () => {
    const client = fakeClient();

    const result = await loadMap(client, "goblin-cave/new_room");

    expect(result).toMatchObject({identifier: "new_room", name: "New Room", barriers: [], connections: [], units: []});
  });
});

describe("loadMapImageUrl", () => {
  it("returns null when the map has no imageUrl", async () => {
    const client = fakeClient();

    expect(await loadMapImageUrl(client, "goblin-cave/gc1-entrance", {imageUrl: null})).toBeNull();
  });

  it("resolves a relative imageUrl against the map's own file", async () => {
    const client = fakeClient({assetUrls: {"zones/goblin-cave/gc1-entrance/gc1-entrance.webp": "https://raw.example/gc1-entrance.webp"}});

    const result = await loadMapImageUrl(client, "goblin-cave/gc1-entrance", {imageUrl: "./gc1-entrance.webp"});

    expect(result).toBe("https://raw.example/gc1-entrance.webp");
  });
});

describe("listUnitTypeKeys", () => {
  it("lists unit_types/*.json, excluding .full.json companions", async () => {
    const client = fakeClient({
      dirs: {unit_types: ["unit_types/goblin-raider.json", "unit_types/goblin-raider.full.json", "unit_types/goblins/goblin-shaman.json"]},
    });

    const result = await listUnitTypeKeys(client);

    expect(result).toEqual(["goblin-raider", "goblins/goblin-shaman"]);
  });
});

describe("unitTypeDetailsFor", () => {
  it("returns name/tokenRadius/speedFactor and resolves a bare-string tokenImageUrl", async () => {
    const client = fakeClient({
      files: {"unit_types/goblin-raider.json": JSON.stringify({name: "Goblin Raider", tokenRadius: 1.5, speedFactor: 1.2, tokenImageUrl: "../assets/tokens/goblin.webp"})},
      assetUrls: {"assets/tokens/goblin.webp": "https://raw.example/goblin.webp"},
    });

    const result = await unitTypeDetailsFor(client, ["goblin-raider"]);

    expect(result).toEqual({"goblin-raider": {name: "Goblin Raider", tokenRadius: 1.5, tokenImageUrl: "https://raw.example/goblin.webp", speedFactor: 1.2}});
  });

  it("resolves the first entry of an array-form tokenImageUrl", async () => {
    const client = fakeClient({
      files: {"unit_types/goblin-raider.json": JSON.stringify({name: "Goblin Raider", tokenImageUrl: ["../assets/tokens/goblin.webp", "../assets/tokens/goblin2.webp"]})},
      assetUrls: {"assets/tokens/goblin.webp": "https://raw.example/goblin.webp"},
    });

    const result = await unitTypeDetailsFor(client, ["goblin-raider"]);

    expect(result["goblin-raider"].tokenImageUrl).toBe("https://raw.example/goblin.webp");
  });

  it("resolves a nested key's token relative to its own file", async () => {
    const client = fakeClient({
      files: {"unit_types/goblins/goblin-shaman.json": JSON.stringify({name: "Goblin Shaman", tokenImageUrl: "../../tokens/unit/goblin-shaman.webp"})},
      assetUrls: {"tokens/unit/goblin-shaman.webp": "https://raw.example/goblin-shaman.webp"},
    });

    const result = await unitTypeDetailsFor(client, ["goblins/goblin-shaman"]);

    expect(result["goblins/goblin-shaman"].tokenImageUrl).toBe("https://raw.example/goblin-shaman.webp");
  });

  it("has no tokenImageUrl when the unit type declares none", async () => {
    const client = fakeClient({files: {"unit_types/slime.json": JSON.stringify({name: "Slime", tokenImageUrl: null})}});

    const result = await unitTypeDetailsFor(client, ["slime"]);

    expect(result.slime.tokenImageUrl).toBeNull();
  });

  it("omits a key whose file no longer exists, rather than erroring", async () => {
    const client = fakeClient();

    const result = await unitTypeDetailsFor(client, ["deleted-type"]);

    expect(result).toEqual({});
  });
});

describe("listItemKeys", () => {
  it("lists items/*.json", async () => {
    const client = fakeClient({dirs: {items: ["items/sword-of-doom.json", "items/iron-shield.json"]}});

    const result = await listItemKeys(client);

    expect(result).toEqual(["sword-of-doom", "iron-shield"]);
  });
});

describe("itemDetailsFor", () => {
  it("returns identifier/name/slot for each key", async () => {
    const client = fakeClient({files: {"items/sword-of-doom.json": JSON.stringify({identifier: "sword-of-doom", name: "Sword of Doom", slot: "main_hand"})}});

    const result = await itemDetailsFor(client, ["sword-of-doom"]);

    expect(result).toEqual({"sword-of-doom": {identifier: "sword-of-doom", name: "Sword of Doom", slot: "main_hand"}});
  });

  it("returns the item's own identifier field, even if it differs from the file key", async () => {
    const client = fakeClient({files: {"items/file-key.json": JSON.stringify({identifier: "actual-identifier", name: "Odd One", slot: "chest"})}});

    const result = await itemDetailsFor(client, ["file-key"]);

    expect(result["file-key"].identifier).toBe("actual-identifier");
  });

  it("omits a key whose file no longer exists, rather than erroring", async () => {
    const client = fakeClient();

    const result = await itemDetailsFor(client, ["deleted-item"]);

    expect(result).toEqual({});
  });
});
