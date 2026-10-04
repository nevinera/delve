import {describe, it, expect} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {newAssetPath, pendingPowerAssets, tokenImageOptions, uploadPowerAsset} from "../assetOps";

const assetUrl = (path) => `url:${path}`;
const UNIT_TYPE = "worlds/w/unit_types/goblin.json";

describe("assetOps", () => {
  it("lists the world's token images relative to a file", () => {
    expect(tokenImageOptions(fixtureDraft(), "worlds/w/zones/forest/hub/hub.json", assetUrl)).toEqual([
      {value: "../../../tokens/goblin.webp", label: "goblin.webp", url: "url:worlds/w/tokens/goblin.webp"},
    ]);
  });

  it("finds a free path for an upload, numbered when the name's taken", () => {
    const draft = fixtureDraft();
    expect(newAssetPath(draft, "tokens/ncu", "old sage.png")).toEqual("worlds/w/tokens/ncu/old-sage.png");

    const taken = draft.write("worlds/w/tokens/ncu/old-sage.png", new Blob(["x"]));
    expect(newAssetPath(taken, "tokens/ncu", "old sage.png")).toEqual("worlds/w/tokens/ncu/old-sage-2.png");
  });

  describe("power assets", () => {
    const blob = new Blob(["icon"]);

    it("stores an upload where its field already points inside the world", () => {
      const power = {name: "Slash", iconURL: "../graphics/icons/slash.png"};
      const [draft, next] = uploadPowerAsset(fixtureDraft(), UNIT_TYPE, power, "iconURL", blob, "whatever.png");

      expect(draft.read("worlds/w/graphics/icons/slash.png")).toBe(blob);
      expect(next).toBe(power);
    });

    it("gives a blank (or out-of-world) field a new path in the world", () => {
      const power = {name: "Slash", iconURL: "", soundEffects: [{sourceURL: "../../../audio/hit.mp3"}]};
      let [draft, next] = uploadPowerAsset(fixtureDraft(), UNIT_TYPE, power, "iconURL", blob, "slash icon.png");
      expect(next.iconURL).toEqual("../graphics/icons/slash-icon.png");
      expect(draft.read("worlds/w/graphics/icons/slash-icon.png")).toBe(blob);

      [draft, next] = uploadPowerAsset(draft, UNIT_TYPE, next, "soundEffects[0].sourceURL", blob, "hit.mp3");
      expect(next.soundEffects[0].sourceURL).toEqual("../audio/hit.mp3");
    });

    it("reports which fields have a pending upload", () => {
      const powers = [{iconURL: "../graphics/icons/slash.png", graphicEffects: [{sourceURL: "../graphics/swipe.webp"}]}];
      const draft = fixtureDraft().write("worlds/w/graphics/swipe.webp", blob);

      expect(pendingPowerAssets(draft, UNIT_TYPE, powers, assetUrl)).toEqual({0: {"graphicEffects[0].sourceURL": "url:worlds/w/graphics/swipe.webp"}});
    });
  });
});
