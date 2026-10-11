import {describe, it, expect} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {worldData} from "../worldOps";
import {setZonePositions, zoneData, zonePositions} from "../zoneOps";
import {createMap, deleteMap, mapData, ncuTokenUrls, removeMapImage, renameMap, setMapImage, setMapThumbnail, updateMap, worldItems, worldUnitTypes} from "../mapOps";
import {CellMapDraft} from "../../../mapEditor/cells/CellMapDraft";
import {ExistingBlob} from "../../../github/commitFiles";

const assetUrl = (path) => `url:${path}`;

describe("mapOps", () => {
  it("edits a map and fills in the zone's refs for what it now uses", () => {
    const draft = updateMap(fixtureDraft(), "forest", "hub", (m) => m.addEntry("units", {unitType: "troll", lootTable: {"gold-ring": 1}}));

    expect(mapData(draft, "forest", "hub").units).toHaveLength(3);
    expect(zoneData(draft, "forest").unitTypes.troll).toEqual({$ref: "../../unit_types/troll.json", referenceTo: "unit_type"});
    expect(zoneData(draft, "forest").items["gold-ring"]).toBeDefined();
  });

  it("follows a renamed connection in the zone's and the world's references to it", () => {
    const positioned = setZonePositions(fixtureDraft(), "forest", {hub: {x: 1, y: 1}, "entryPoint:hub/central": {x: 2, y: 2}});
    const draft = updateMap(updateMap(positioned, "forest", "hub", (m) => m.updateEntryField("connections", 0, "identifier", "middle")),
      "forest", "hub", (m) => m.updateEntryField("connections", 1, "identifier", "top"));
    const zone = zoneData(draft, "forest");

    expect(zone.entryPoints).toEqual({"hub/middle": null});
    expect(zone.openConnections).toEqual({"hub/top": "north-exit"});
    expect(worldData(draft).entryPoints).toEqual({"forest/hub/middle": null});
    expect(zonePositions(draft, "forest")).toEqual({hub: {x: 1, y: 1}, "entryPoint:hub/middle": {x: 2, y: 2}});
  });

  it("leaves the zone's references alone when a connection is added or removed", () => {
    const draft = updateMap(fixtureDraft(), "forest", "hub", (m) => m.removeEntry("connections", 0));

    expect(zoneData(draft, "forest").openConnections).toEqual({"hub/north": "north-exit"});
  });

  it("creates a blank map in the zone's directory and adds it to the zone", () => {
    const draft = createMap(fixtureDraft(), "cave", "mouth", "Cave Mouth");

    expect(mapData(draft, "cave", "mouth")).toMatchObject({identifier: "mouth", name: "Cave Mouth", units: []});
    expect(zoneData(draft, "cave").maps).toEqual([{$ref: "./mouth/mouth.json", referenceTo: "map"}]);
    expect(() => createMap(draft, "cave", "mouth")).toThrow(/already exists/);
    expect(() => createMap(draft, "cave", "a b")).toThrow(/valid identifier/);
  });

  describe("renameMap", () => {
    const renamed = () => renameMap(setZonePositions(fixtureDraft(), "forest", {hub: {x: 1, y: 1}, "entryPoint:hub/central": {x: 2, y: 2}}), "forest", "hub", "plaza");

    it("moves the map's files and sets its identifier", () => {
      const draft = renamed();

      expect(mapData(draft, "forest", "plaza")).toMatchObject({identifier: "plaza", name: "Hub", imageUrl: "hub.png"});
      expect(draft.changes()["worlds/w/zones/forest/plaza/hub.png"]).toEqual(new ExistingBlob("png-sha"));
      expect(draft.paths("worlds/w/zones/forest/hub")).toEqual([]);
    });

    it("rewrites the zone's and the world's references to it", () => {
      const draft = renamed();
      const zone = zoneData(draft, "forest");

      expect(zone.maps).toEqual([{$ref: "./plaza/plaza.json", referenceTo: "map"}]);
      expect(zone.entryPoints).toEqual({"plaza/central": null});
      expect(zone.openConnections).toEqual({"plaza/north": "north-exit"});
      expect(worldData(draft).entryPoints).toEqual({"forest/plaza/central": null});
      expect(zonePositions(draft, "forest")).toEqual({plaza: {x: 1, y: 1}, "entryPoint:plaza/central": {x: 2, y: 2}});
    });
  });

  it("deletes a map, its directory and the zone's references to it", () => {
    const draft = deleteMap(fixtureDraft(), "forest", "hub");

    expect(draft.paths("worlds/w/zones/forest/hub")).toEqual([]);
    expect(zoneData(draft, "forest")).toMatchObject({maps: [], entryPoints: {}, openConnections: {}});
  });

  it("stores a new background and thumbnail, replacing a differently named one", () => {
    const file = new Blob(["png"]);
    const thumbnail = new Blob(["thumb"]);

    const draft = setMapImage(fixtureDraft(), "forest", "hub", {file, name: "hub.webp", pixelDimensions: {width: 10, height: 20}, thumbnail, previous: "hub.png"});

    expect(mapData(draft, "forest", "hub")).toMatchObject({imageUrl: "hub.webp", thumbnailUrl: "hub.thumb.webp", pixelDimensions: {width: 10, height: 20}});
    expect(draft.assetSource("worlds/w/zones/forest/hub/hub.webp")).toEqual({blob: file});
    expect(draft.assetSource("worlds/w/zones/forest/hub/hub.thumb.webp")).toEqual({blob: thumbnail});
    expect(draft.exists("worlds/w/zones/forest/hub/hub.png")).toBe(false);
  });

  it("removes a map's image and its thumbnail, falling back to its cells", () => {
    const file = new Blob(["png"]);
    const thumbnail = new Blob(["thumb"]);
    const cellMap = CellMapDraft.blank({cols: 4, rows: 3}).data;
    const withImage = setMapImage(updateMap(fixtureDraft(), "forest", "hub", (m) => m.setField("cellMap", cellMap)), "forest", "hub", {file, name: "hub.webp", pixelDimensions: {width: 10, height: 20}, thumbnail});
    const draft = removeMapImage(withImage, "forest", "hub");

    const map = mapData(draft, "forest", "hub");
    expect(map).not.toHaveProperty("imageUrl");
    expect(map).not.toHaveProperty("pixelDimensions");
    expect(map).not.toHaveProperty("thumbnailUrl");
    expect(map.feetDimensions).toEqual({width: 18.764, height: 17.5});
    expect(draft.exists("worlds/w/zones/forest/hub/hub.webp")).toBe(false);
    expect(draft.exists("worlds/w/zones/forest/hub/hub.thumb.webp")).toBe(false);
  });

  it("stores a cell map's thumbnail", () => {
    const thumbnail = new Blob(["thumb"]);
    const draft = setMapThumbnail(fixtureDraft(), "forest", "hub", thumbnail);
    expect(mapData(draft, "forest", "hub").thumbnailUrl).toBe("hub.thumb.webp");
    expect(draft.assetSource("worlds/w/zones/forest/hub/hub.thumb.webp")).toEqual({blob: thumbnail});
  });

  it("lists the world's own unit types and items for the map panels", () => {
    const draft = fixtureDraft().write("worlds/w/items/iron-ring.json", {identifier: "iron-ring", name: "Iron Ring", slot: "ring"});

    expect(worldUnitTypes(draft, assetUrl)).toEqual({
      keys: ["goblin"],
      details: {goblin: {name: "Goblin", tokenRadius: undefined, speedFactor: undefined, tokenImageUrl: "url:worlds/w/tokens/goblin.webp", tags: [], category: null}},
    });
    expect(worldItems(draft)).toEqual({keys: ["iron-ring"], details: {"iron-ring": {identifier: "iron-ring", name: "Iron Ring", slot: "ring"}}});
  });

  it("resolves NCU token images relative to the map, leaving stock references alone", () => {
    const draft = updateMap(fixtureDraft(), "forest", "hub", (m) => m.setField("ncus", [{tokenImageUrl: "../../../tokens/elder.webp"}, {tokenImageUrl: ":villager:"}]));

    expect(ncuTokenUrls(draft, "forest", "hub", assetUrl)).toEqual({
      "../../../tokens/elder.webp": "url:worlds/w/tokens/elder.webp",
      ":villager:": ":villager:",
    });
  });
});
