import {describe, it, expect, vi, beforeEach} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {validateDraft} from "../validateDraft";
import * as validators from "../../../validators/validateContent";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(validators, "validateZone").mockResolvedValue({valid: true});
  vi.spyOn(validators, "validateWorld").mockResolvedValue({valid: true});
  vi.spyOn(validators, "validateWorldReferences").mockResolvedValue({valid: true});
});

// The fixture's maps reference images and unit types it doesn't fully
// provide; fill those in so the baseline is clean.
function cleanDraft() {
  return fixtureDraft()
    .write("worlds/w/zones/forest/hub/hub.thumb.webp", new Blob(["t"]))
    .write("worlds/w/tokens/goblin.webp", new Blob(["g"]));
}

describe("validateDraft", () => {
  it("passes a consistent world, posting each resolved zone and the world's references", async () => {
    expect(await validateDraft(cleanDraft())).toEqual([]);

    expect(validators.validateZone).toHaveBeenCalledTimes(2);
    expect(validators.validateZone.mock.calls[0][0].maps[0]).toMatchObject({identifier: "hub"});
    expect(validators.validateWorldReferences).toHaveBeenCalledWith(
      expect.objectContaining({name: "W"}),
      {
        forest: {openConnections: {"hub/north": "north-exit"}, entryPoints: {"hub/central": null}},
        cave: {openConnections: {}, entryPoints: {}},
      }
    );
  });

  it("flags references that leave the world or don't exist", async () => {
    const draft = cleanDraft()
      .update("worlds/w/unit_types/goblin.json", (u) => ({...u, tokenImageUrl: ["../../../tokens/goblin.webp"]}))
      .remove("worlds/w/zones/forest/hub/hub.thumb.webp");

    const messages = (await validateDraft(draft)).map((p) => `${p.file}: ${p.message}`);

    expect(messages).toContain("worlds/w/unit_types/goblin.json: ../../../tokens/goblin.webp points outside the world");
    expect(messages).toContain("worlds/w/zones/forest/hub/hub.json: hub.thumb.webp doesn't exist");
  });

  it("flags bad identifiers and a map whose identifier doesn't match its directory", async () => {
    const draft = cleanDraft()
      .write("worlds/w/unit_types/bad key.json", {name: "x"})
      .update("worlds/w/zones/forest/passage/passage.json", (m) => ({...m, identifier: "corridor"}));

    const problems = await validateDraft(draft);

    expect(problems.map((p) => p.message)).toEqual(expect.arrayContaining([
      'Unit type identifier "bad key" may only use letters, digits, "_" and "-"',
      'Map passage\'s identifier is "corridor"; it must match its directory',
    ]));
    expect(problems.find((p) => p.message.startsWith("Map passage")).location).toEqual({zone: "forest"});
  });

  it("reports a zone that doesn't resolve, without posting it", async () => {
    const draft = cleanDraft().remove("worlds/w/unit_types/goblin.json");

    const problems = await validateDraft(draft);

    expect(problems).toContainEqual({file: "worlds/w/zones/forest/forest.json", location: {zone: "forest"}, message: expect.stringMatching(/goblin.json doesn't resolve/)});
    expect(validators.validateZone).toHaveBeenCalledTimes(1);
  });

  it("reports the server's zone and world errors against their files", async () => {
    validators.validateZone.mockResolvedValue({valid: false, error: {message: "elvl must be an integer (at $.elvl)"}});
    validators.validateWorldReferences.mockResolvedValue({valid: false, error: {message: 'zone "cave" has no openConnection "entrance"'}});

    const problems = await validateDraft(cleanDraft());

    expect(problems).toContainEqual({file: "worlds/w/w.json", location: {}, message: 'zone "cave" has no openConnection "entrance"'});
    expect(problems).toContainEqual({file: "worlds/w/zones/cave/cave.json", location: {zone: "cave"}, message: "elvl must be an integer (at $.elvl)"});
  });
});
