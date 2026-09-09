import {describe, it, expect, vi, beforeEach} from "vitest";
import {saveAbility} from "../saveAbility";
import {commitFiles} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", () => ({
  commitFiles: vi.fn(),
}));

describe("saveAbility", () => {
  beforeEach(() => {
    commitFiles.mockReset();
  });

  it("commits the ability JSON at abilities/<key>.json with a name-based message", async () => {
    commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
    const ability = {name: "Firebolt", castTime: null};

    const result = await saveAbility("firebolt", ability, {});

    expect(commitFiles).toHaveBeenCalledWith({"abilities/firebolt.json": ability}, {message: "Update Firebolt"});
    expect(result).toEqual({commitSha: "abc123", branch: "main"});
  });

  it("falls back to the key in the commit message when the ability has no name", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});

    await saveAbility("firebolt", {name: ""}, {});

    expect(commitFiles).toHaveBeenCalledWith(expect.anything(), {message: "Update firebolt"});
  });

  it("resolves a pending top-level upload's destination from the field's current relative path", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const ability = {name: "Firebolt", iconURL: "../graphics/icons/firebolt.svg"};
    const file = new File(["x"], "icon.svg");

    await saveAbility("firebolt", ability, {iconURL: file});

    expect(commitFiles).toHaveBeenCalledWith(
      {"abilities/firebolt.json": ability, "graphics/icons/firebolt.svg": file},
      {message: "Update Firebolt"}
    );
  });

  it("resolves a per-entry upload's destination the same way", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const ability = {
      name: "Firebolt",
      graphicEffects: [{sourceURL: "../graphics/effects/impact.webp", duration: 0.3}],
    };
    const file = new File(["x"], "impact.webp");

    await saveAbility("firebolt", ability, {"graphicEffects[0].sourceURL": file});

    expect(commitFiles).toHaveBeenCalledWith(
      {"abilities/firebolt.json": ability, "graphics/effects/impact.webp": file},
      {message: "Update Firebolt"}
    );
  });

  it("resolves a relative path against the ability's own directory, not the repo root", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const ability = {name: "Firebolt", iconURL: "icons/firebolt.svg"};
    const file = new File(["x"], "icon.svg");

    await saveAbility("firebolt", ability, {iconURL: file});

    const [filesByPath] = commitFiles.mock.calls[0];
    expect(filesByPath).toHaveProperty("abilities/icons/firebolt.svg", file);
  });

  it("commits a nested key's JSON at abilities/<key>.json and resolves its assets relative to its own subdirectory", async () => {
    commitFiles.mockResolvedValue({commitSha: "x", branch: "main"});
    const ability = {name: "Wildshape", iconURL: "../graphics/icons/wildshape.svg"};
    const file = new File(["x"], "icon.svg");

    await saveAbility("classes/druid/wildshape", ability, {iconURL: file});

    expect(commitFiles).toHaveBeenCalledWith(
      {"abilities/classes/druid/wildshape.json": ability, "abilities/classes/graphics/icons/wildshape.svg": file},
      {message: "Update Wildshape"}
    );
  });

  it("throws, without calling commitFiles, when a pending upload's field is still blank", async () => {
    const ability = {name: "Firebolt", iconURL: ""};
    const file = new File(["x"], "icon.svg");

    await expect(saveAbility("firebolt", ability, {iconURL: file})).rejects.toThrow(/iconURL/);
    expect(commitFiles).not.toHaveBeenCalled();
  });

  it("lists every field with a blank path in the error, not just the first", async () => {
    const ability = {name: "Firebolt", iconURL: "", graphicEffects: [{sourceURL: "", duration: 0.3}]};
    const files = {iconURL: new File(["x"], "a.svg"), "graphicEffects[0].sourceURL": new File(["x"], "b.png")};

    await expect(saveAbility("firebolt", ability, files)).rejects.toThrow(/iconURL.*graphicEffects\[0\]\.sourceURL/s);
  });
});
