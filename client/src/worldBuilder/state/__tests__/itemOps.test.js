import {describe, it, expect} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {zoneData} from "../zoneOps";
import {mapData} from "../mapOps";
import {createItem, deleteItem, itemData, itemKeys, itemUses, renameItem, updateItem} from "../itemOps";

describe("itemOps", () => {
  it("lists the world's items, and keeps an item's identifier its key", () => {
    const draft = updateItem(fixtureDraft(), "iron-ring", {...itemData(fixtureDraft(), "iron-ring"), identifier: "other", name: "Ring"});
    expect(itemKeys(draft)).toEqual(["iron-ring"]);
    expect(itemData(draft, "iron-ring")).toMatchObject({identifier: "iron-ring", name: "Ring"});
  });

  it("creates a blank item, refusing a taken or malformed key", () => {
    const draft = createItem(fixtureDraft(), "gold-ring", "Gold Ring");

    expect(itemData(draft, "gold-ring")).toMatchObject({identifier: "gold-ring", name: "Gold Ring"});
    expect(() => createItem(draft, "gold-ring")).toThrow(/already exists/);
    expect(() => createItem(draft, "a b")).toThrow(/valid identifier/);
  });

  it("finds which units drop it", () => {
    expect(itemUses(fixtureDraft(), "iron-ring")).toEqual([{zone: "forest", map: "hub", count: 1}]);
  });

  it("renames an item, rewriting loot tables and zone entries", () => {
    const withEntry = fixtureDraft().update("worlds/w/zones/forest/forest.json", (zone) => ({...zone, items: {"iron-ring": {$ref: "../../items/iron-ring.json", referenceTo: "item"}}}));
    const draft = renameItem(withEntry, "iron-ring", "steel-ring");

    expect(itemKeys(draft)).toEqual(["steel-ring"]);
    expect(itemData(draft, "steel-ring").identifier).toEqual("steel-ring");
    expect(mapData(draft, "forest", "hub").units[1].lootTable).toEqual({"steel-ring": 1});
    expect(zoneData(draft, "forest").items).toEqual({"steel-ring": {$ref: "../../items/steel-ring.json", referenceTo: "item"}});
  });

  it("refuses to delete an item a unit drops, saying where", () => {
    expect(() => deleteItem(fixtureDraft(), "iron-ring")).toThrow('"iron-ring" is still dropped on forest/hub (1)');
    expect(itemKeys(deleteItem(createItem(fixtureDraft(), "spare"), "spare"))).toEqual(["iron-ring"]);
  });
});
