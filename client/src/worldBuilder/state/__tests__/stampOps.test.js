import {describe, it, expect} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {ExistingBlob} from "../../../github/commitFiles";
import {LibraryReader} from "../libraryReader";
import {fakeClient} from "./fakeLibrary";
import {libraryStampSets, prepareStampSetImport, setStampSet, stampSheetPath, zoneStamps} from "../stampOps";
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
});
