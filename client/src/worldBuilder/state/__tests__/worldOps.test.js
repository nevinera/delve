import {describe, it, expect} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {RepoSnapshot} from "../RepoSnapshot";
import {WorldDraft} from "../WorldDraft";
import {createWorld, createZone, deleteZone, renameZone, setWorldField, worldData, worldPositions, zoneDeletionImpact, zoneKeys} from "../worldOps";
import {ExistingBlob} from "../../../github/commitFiles";

describe("worldOps", () => {
  it("creates a world in an empty snapshot", () => {
    const empty = WorldDraft.fromSnapshot(new RepoSnapshot({worldKey: "new", branch: "b", commitSha: "c", files: {}, json: {}}));

    const draft = createWorld(empty, "New World");

    expect(worldData(draft)).toMatchObject({name: "New World", zones: {}, entryPoints: {}});
    expect(draft.exists("worlds/new/new.layout.json")).toBe(true);
    expect(() => createWorld(draft, "Again")).toThrow(/already exists/);
  });

  it("sets world fields", () => {
    expect(worldData(setWorldField(fixtureDraft(), "name", "Bigger")).name).toEqual("Bigger");
  });

  describe("createZone", () => {
    it("writes the zone's files and adds it to the world", () => {
      const draft = createZone(fixtureDraft(), "swamp", "The Swamp");

      expect(draft.read("worlds/w/zones/swamp/swamp.json")).toMatchObject({name: "The Swamp", maps: []});
      expect(draft.exists("worlds/w/zones/swamp/swamp.layout.json")).toBe(true);
      expect(worldData(draft).zones.swamp).toEqual({path: "./zones/swamp/swamp.json", name: "The Swamp", description: null});
    });

    it("refuses bad or taken identifiers", () => {
      expect(() => createZone(fixtureDraft(), "a/b")).toThrow(/valid identifier/);
      expect(() => createZone(fixtureDraft(), "cave")).toThrow(/already exists/);
    });
  });

  describe("renameZone", () => {
    const renamed = () => renameZone(fixtureDraft(), "forest", "woods");

    it("moves the zone's files, renaming its own", () => {
      const draft = renamed();

      expect(draft.read("worlds/w/zones/woods/woods.json")).toMatchObject({name: "Forest"});
      expect(draft.exists("worlds/w/zones/woods/woods.layout.json")).toBe(true);
      expect(draft.read("worlds/w/zones/woods/hub/hub.json")).toMatchObject({identifier: "hub"});
      expect(draft.changes()["worlds/w/zones/woods/hub/hub.png"]).toEqual(new ExistingBlob("png-sha"));
      expect(draft.paths("worlds/w/zones/forest")).toEqual([]);
      expect(draft.exists("worlds/w/zones/woods/forest.json")).toBe(false);
    });

    it("rewrites the world's zone entry, links, entry points and positions", () => {
      const draft = renamed();
      const world = worldData(draft);

      expect(zoneKeys(draft)).toEqual(["woods", "cave"]);
      expect(world.zones.woods.path).toEqual("./zones/woods/woods.json");
      expect(world.worldLinks[0].zoneA.zone).toEqual("woods");
      expect(world.entryPoints).toEqual({"woods/hub/central": null});
      expect(worldPositions(draft)).toEqual({woods: {x: 1, y: 2}, "entryPoint:woods/hub/central": {x: 3, y: 4}, cave: {x: 5, y: 6}});
    });

    it("renaming back leaves no changes at all", () => {
      expect(renameZone(renamed(), "woods", "forest").hasChanges).toBe(false);
    });

    it("refuses a taken name", () => {
      expect(() => renameZone(fixtureDraft(), "forest", "cave")).toThrow(/already exists/);
    });
  });

  describe("deleteZone", () => {
    it("removes the zone's files and everything in the world that pointed at it", () => {
      const draft = deleteZone(fixtureDraft(), "forest");
      const world = worldData(draft);

      expect(draft.paths("worlds/w/zones/forest")).toEqual([]);
      expect(Object.keys(world.zones)).toEqual(["cave"]);
      expect(world.worldLinks).toEqual([]);
      expect(world.entryPoints).toEqual({});
      expect(worldPositions(draft)).toEqual({cave: {x: 5, y: 6}});
    });

    it("reports what a delete would take with it", () => {
      expect(zoneDeletionImpact(fixtureDraft(), "forest")).toEqual({files: 5, worldLinks: 1, entryPoints: 1});
    });
  });
});
