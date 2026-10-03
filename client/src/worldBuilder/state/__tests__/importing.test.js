import {describe, it, expect} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {ExistingBlob} from "../../../github/commitFiles";
import {LibraryReader} from "../libraryReader";
import {fakeClient} from "./fakeLibrary";
import {applyCopies, libraryUnitTypes, preparePowerImport, prepareUnitTypeImport, relocateAssets} from "../importing";
import {unitTypeData} from "../unitTypeOps";
import {assetUrlFor} from "../assetUrls";

const LIBRARY = {
  "unit_types/demo/troll.json": {
    name: "Troll", tokenImageUrl: "../../tokens/unit/troll.webp",
    powers: [{$ref: "../../abilities/smash.json", referenceTo: "ability"}],
  },
  "unit_types/demo/troll.full.json": {},
  "abilities/smash.json": {name: "Smash", iconURL: "../graphics/icons/smash.png", soundEffects: [{sourceURL: ":thud:"}]},
  "tokens/unit/troll.webp": "img",
  "graphics/icons/smash.png": "img",
};

const reader = () => new LibraryReader(fakeClient(LIBRARY), "c1");

describe("importing", () => {
  it("relocates relative asset URLs to the world's copies, leaving stock ones", () => {
    const {content, assets} = relocateAssets(
      {tokenImageUrl: ["../../tokens/unit/troll.webp"], powers: [{iconURL: ":stock:"}]},
      "unit_types/demo/troll.json", "worlds/w/unit_types/troll.json", "w",
    );
    expect(content).toEqual({tokenImageUrl: ["../tokens/unit/troll.webp"], powers: [{iconURL: ":stock:"}]});
    expect(assets).toEqual(["tokens/unit/troll.webp"]);
  });

  it("lists the library's unit types", async () => {
    expect(await libraryUnitTypes(reader())).toEqual([{path: "unit_types/demo/troll.json", label: "demo/troll"}]);
  });

  it("imports a library unit type with its powers inline and its assets copied in", async () => {
    const prepared = await prepareUnitTypeImport(fixtureDraft(), reader(), "unit_types/demo/troll.json", "troll");
    const draft = prepared.apply(fixtureDraft());

    expect(unitTypeData(draft, "troll")).toEqual({
      name: "Troll", tokenImageUrl: ["../tokens/unit/troll.webp"],
      powers: [{name: "Smash", iconURL: "../graphics/icons/smash.png", soundEffects: [{sourceURL: ":thud:"}]}],
    });
    expect(draft.read("worlds/w/tokens/unit/troll.webp")).toEqual(new ExistingBlob("sha:tokens/unit/troll.webp", "tokens/unit/troll.webp"));
    expect(draft.read("worlds/w/graphics/icons/smash.png")).toBeInstanceOf(ExistingBlob);
    expect(prepared.missing).toEqual([]);
    // Shown from the library until it's committed.
    expect(assetUrlFor(draft, "o/content", "worlds/w/tokens/unit/troll.webp")).toEqual("https://raw.githubusercontent.com/o/content/c1/tokens/unit/troll.webp");
  });

  it("refuses a taken key, and reports assets the library lacks", async () => {
    await expect(prepareUnitTypeImport(fixtureDraft(), reader(), "unit_types/demo/troll.json", "goblin")).rejects.toThrow(/already exists/);

    const repo = {...LIBRARY};
    delete repo["tokens/unit/troll.webp"];
    const prepared = await prepareUnitTypeImport(fixtureDraft(), new LibraryReader(fakeClient(repo), "c1"), "unit_types/demo/troll.json", "troll");
    expect(prepared.missing).toEqual(["tokens/unit/troll.webp"]);
  });

  it("prepares a library power for a world file, copying its assets only when applied", async () => {
    const target = "worlds/w/unit_types/goblin.json";
    const power = {name: "Smash", iconURL: "../../../graphics/icons/smash.png"};
    const {power: adopted, copies} = await preparePowerImport(fixtureDraft(), reader(), power, target, target);

    expect(adopted.iconURL).toEqual("../graphics/icons/smash.png");
    expect(applyCopies(fixtureDraft(), copies).exists("worlds/w/graphics/icons/smash.png")).toBe(true);
  });
});
