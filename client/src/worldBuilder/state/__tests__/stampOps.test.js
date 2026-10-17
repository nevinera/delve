import {describe, it, expect} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {ExistingBlob} from "../../../github/commitFiles";
import {LibraryReader} from "../libraryReader";
import {fakeClient} from "./fakeLibrary";
import {buildStampSet, libraryStampSets, prepareStampSetImport, setStampSet, stampSheetPath, zoneStamps} from "../stampOps";
import {zoneData} from "../zoneOps";

const CAMP = {name: "Camp", imageUrl: "./camp.png", stamps: {tent: {feetWidth: 12, frames: [{x: 0, y: 0, width: 10, height: 10}]}}};
const LIBRARY = {
  "graphics/stamps/camp.json": CAMP,
  "graphics/stamps/camp.png": "img",
  "graphics/stamps/src/camp/tent.svg": "svg",
  "graphics/stamps/src/camp/set.json": {name: "Camp", stamps: {}},
};
const reader = () => new LibraryReader(fakeClient(LIBRARY), "c1");

describe("stampOps", () => {
  it("has no stamps for a zone without them", () => {
    expect(zoneStamps(fixtureDraft(), "forest")).toEqual({sets: {}, file: null});
  });

  it("lists the library's stamp sets", async () => {
    expect(await libraryStampSets(reader())).toEqual([{path: "graphics/stamps/camp.json", label: "camp"}]);
  });

  it("copies a set into the zone's stamps.json, its sheet into the world", async () => {
    const prepared = await prepareStampSetImport(fixtureDraft(), reader(), "forest", "graphics/stamps/camp.json", "camp");
    const draft = prepared.apply(fixtureDraft());

    expect(zoneData(draft, "forest").stamps).toEqual({$ref: "./stamps.json", referenceTo: "stamps"});
    expect(draft.read("worlds/w/zones/forest/stamps.json")).toEqual({camp: {...CAMP, imageUrl: "../../graphics/stamps/camp.png"}});
    expect(draft.read("worlds/w/graphics/stamps/camp.png")).toEqual(new ExistingBlob("sha:graphics/stamps/camp.png", "graphics/stamps/camp.png"));
    expect(stampSheetPath(draft, "forest", "camp")).toEqual("worlds/w/graphics/stamps/camp.png");
    expect(prepared.missing).toEqual([]);
  });

  it("adds a set beside the zone's others", () => {
    const one = setStampSet(fixtureDraft(), "forest", "camp", CAMP);
    const two = setStampSet(one, "forest", "village", {...CAMP, name: "Village"});
    expect(Object.keys(zoneStamps(two, "forest").sets)).toEqual(["camp", "village"]);
  });

  it("moves inline stamps out to stamps.json", () => {
    const draft = fixtureDraft((files) => {
      files["worlds/w/zones/forest/forest.json"].stamps = {camp: CAMP};
    });
    const next = setStampSet(draft, "forest", "village", CAMP);
    expect(zoneData(next, "forest").stamps.$ref).toEqual("./stamps.json");
    expect(Object.keys(next.read("worlds/w/zones/forest/stamps.json"))).toEqual(["camp", "village"]);
  });

  describe("buildStampSet", () => {
    const stamps = {rock: {name: "Rock", feetWidth: 3, frames: [{x: 0, y: 0, width: 8, height: 8}]}};
    const sheet = new Blob(["png"]);
    const build = (draft, key, extra = {}) => buildStampSet(draft, "forest", key, {name: "Rocks", license: "CC0-1.0", stamps, sheet, ...extra});

    it("makes a new set with its sheet in the world and the zone $ref'ing stamps.json", () => {
      const draft = build(fixtureDraft(), "rocks");
      const set = zoneStamps(draft, "forest").sets.rocks;

      expect(set).toEqual({name: "Rocks", imageUrl: "../../graphics/stamps/rocks.png", license: "CC0-1.0", stamps});
      expect(stampSheetPath(draft, "forest", "rocks")).toEqual("worlds/w/graphics/stamps/rocks.png");
      expect(draft.exists("worlds/w/graphics/stamps/rocks.png")).toBe(true);
    });

    it("adds stamps to an existing set, replacing its sheet in place", () => {
      const first = build(fixtureDraft(), "rocks");
      const more = {log: {feetWidth: 7, frames: [{x: 0, y: 10, width: 8, height: 8}]}};
      const draft = buildStampSet(first, "forest", "rocks", {stamps: more, sheet: new Blob(["bigger"])});

      expect(Object.keys(zoneStamps(draft, "forest").sets.rocks.stamps)).toEqual(["rock", "log"]);
      expect(zoneStamps(draft, "forest").sets.rocks.license).toEqual("CC0-1.0");
    });

    it("needs a license, attribution for BY, and unused keys", () => {
      expect(() => build(fixtureDraft(), "rocks", {license: "GPL"})).toThrow(/license/);
      expect(() => build(fixtureDraft(), "rocks", {license: "CC-BY-4.0"})).toThrow(/attribution/);
      expect(() => build(fixtureDraft(), "Bad Key")).toThrow(/key/);
      expect(() => buildStampSet(build(fixtureDraft(), "rocks"), "forest", "rocks", {stamps, sheet})).toThrow(/already has/);
    });
  });
});
