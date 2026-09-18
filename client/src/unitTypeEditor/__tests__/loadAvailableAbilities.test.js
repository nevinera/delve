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
  it("lists abilities/units, not scoped to any one unit type's key", async () => {
    const client = fakeClient({paths: [], files: {}});

    await loadAvailableAbilities(client);

    expect(client.listDirectory).toHaveBeenCalledWith("abilities/units");
  });

  it("includes a bare abilities/units/*.json entry", async () => {
    const client = fakeClient({
      paths: ["abilities/units/bite.json"],
      files: {"abilities/units/bite.json": JSON.stringify({name: "Bite"})},
    });

    const result = await loadAvailableAbilities(client);

    expect(Object.keys(result)).toEqual(["units/bite"]);
  });

  it("includes a one-level-nested abilities/units/*/*.json entry", async () => {
    const client = fakeClient({
      paths: ["abilities/units/goblins/slash.json"],
      files: {"abilities/units/goblins/slash.json": JSON.stringify({name: "Slash"})},
    });

    const result = await loadAvailableAbilities(client);

    expect(Object.keys(result)).toEqual(["units/goblins/slash"]);
  });

  it("excludes anything nested more than one level deep", async () => {
    const client = fakeClient({
      paths: ["abilities/units/goblins/melee/too-deep.json"],
      files: {},
    });

    const result = await loadAvailableAbilities(client);

    expect(result).toEqual({});
    expect(client.fetchFile).not.toHaveBeenCalled();
  });

  it("resolves each ability's own asset URLs relative to its own file", async () => {
    const client = fakeClient({
      paths: ["abilities/units/goblins/slash.json"],
      files: {"abilities/units/goblins/slash.json": JSON.stringify({name: "Slash", iconURL: "../../icons/slash.svg"})},
    });

    const result = await loadAvailableAbilities(client);

    expect(result["units/goblins/slash"].assetMap).toEqual({
      "../../icons/slash.svg": "abilities/icons/slash.svg",
    });
  });
});
