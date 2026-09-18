import {describe, it, expect, vi} from "vitest";
import {loadAvailableAbilities} from "../loadAvailableAbilities";

function fakeClient({paths, files, assetUrls = {}}) {
  return {
    listDirectory: vi.fn().mockResolvedValue(paths),
    fetchFile: vi.fn((path) => Promise.resolve(files[path])),
    assetUrl: vi.fn((path) => Promise.resolve(assetUrls[path] ?? path)),
  };
}

describe("loadAvailableAbilities", () => {
  it("returns nothing for an empty directory", async () => {
    const client = fakeClient({paths: [], files: {}});

    const result = await loadAvailableAbilities(client, "puncher");

    expect(result).toEqual({});
    expect(client.listDirectory).toHaveBeenCalledWith("abilities/classes/puncher");
  });

  it("keys each entry by its path relative to abilities/, minus .json", async () => {
    const client = fakeClient({
      paths: ["abilities/classes/puncher/punch.json"],
      files: {"abilities/classes/puncher/punch.json": JSON.stringify({name: "Punch"})},
    });

    const result = await loadAvailableAbilities(client, "puncher");

    expect(Object.keys(result)).toEqual(["classes/puncher/punch"]);
    expect(result["classes/puncher/punch"].ability).toEqual({name: "Punch"});
  });

  it("resolves each ability's own asset URLs relative to its own file, not the class's", async () => {
    const client = fakeClient({
      paths: ["abilities/classes/puncher/punch.json"],
      files: {"abilities/classes/puncher/punch.json": JSON.stringify({name: "Punch", iconURL: "../graphics/icons/punch.svg"})},
    });

    const result = await loadAvailableAbilities(client, "puncher");

    expect(result["classes/puncher/punch"].assetMap).toEqual({
      "../graphics/icons/punch.svg": "abilities/classes/graphics/icons/punch.svg",
    });
  });

  it("excludes a stock reference from the asset map", async () => {
    const client = fakeClient({
      paths: ["abilities/classes/puncher/punch.json"],
      files: {"abilities/classes/puncher/punch.json": JSON.stringify({name: "Punch", iconURL: ":heal:"})},
    });

    const result = await loadAvailableAbilities(client, "puncher");

    expect(result["classes/puncher/punch"].assetMap).toEqual({});
  });
});
