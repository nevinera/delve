import {describe, it, expect} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {deleteZone, renameZone, worldData} from "../worldOps";
import {deleteMap, renameMap} from "../mapOps";
import {worldFile} from "../worldPaths";

const loc = (x, y) => ({x, y});
const outline = [loc(0, 0), loc(300, 0), loc(300, 300), loc(0, 300)];

function withAtlas(draft = fixtureDraft()) {
  return draft.update(worldFile(draft.worldKey), (data) => ({
    ...data,
    atlas: {zones: {forest: {outline, maps: {hub: loc(0, 0), passage: loc(100, 0)}}, cave: {outline, maps: {}}}},
  }));
}

const atlasZones = (draft) => worldData(draft).atlas.zones;

describe("atlas upkeep", () => {
  it("follows a renamed zone", () => {
    const zones = atlasZones(renameZone(withAtlas(), "forest", "woods"));
    expect(Object.keys(zones).sort()).toEqual(["cave", "woods"]);
    expect(zones.woods.maps.hub).toEqual(loc(0, 0));
  });

  it("drops a deleted zone", () => {
    expect(Object.keys(atlasZones(deleteZone(withAtlas(), "forest")))).toEqual(["cave"]);
  });

  it("follows a renamed map", () => {
    expect(atlasZones(renameMap(withAtlas(), "forest", "hub", "plaza")).forest.maps).toEqual({plaza: loc(0, 0), passage: loc(100, 0)});
  });

  it("drops a deleted map", () => {
    expect(atlasZones(deleteMap(withAtlas(), "forest", "hub")).forest.maps).toEqual({passage: loc(100, 0)});
  });

  it("leaves a world with no atlas alone", () => {
    expect(worldData(renameZone(fixtureDraft(), "forest", "woods")).atlas).toBeUndefined();
    expect(worldData(deleteMap(fixtureDraft(), "forest", "hub")).atlas).toBeUndefined();
  });
});

describe("resetAtlas", () => {
  it("lays out every zone's referenced maps", async () => {
    const {resetAtlas} = await import("../atlasOps");
    const zones = atlasZones(resetAtlas(fixtureDraft()));
    expect(Object.keys(zones).sort()).toEqual(["cave", "forest"]);
    expect(zones.forest.maps).toEqual({hub: {x: 60, y: 60}});
    expect(zones.cave.maps).toEqual({});
  });
});
