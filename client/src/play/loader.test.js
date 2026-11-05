import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { PlayWorld, rawUrl } from "./loader.js";

const json = (data) => strToU8(JSON.stringify(data));

// A released world's files, served as raw GitHub would, noting each fetch.
function served(files) {
  const fetched = [];
  const fetchFn = async (url) => {
    fetched.push(url);
    const path = url.replace(rawUrl("me/w", "c0ffee", ""), "");
    const bytes = files.get(path);
    return bytes ? { ok: true, arrayBuffer: async () => bytes.buffer } : { ok: false, status: 404 };
  };
  return { fetched, world: new PlayWorld({ repo: "me/w", sha: "c0ffee", paths: [...files.keys()], fetchFn }) };
}

describe("playing a released world", () => {
  const files = new Map([
    ["world.json", json({ version: 2, name: "W", continents: [{ key: "main", name: "Main" }] })],
    ["objects/abcd1234.json", json({ id: "abcd1234", name: "x", palette: [], pieces: [] })],
    ["places/continents/main/platters/0_0.platter", strToU8("platter")],
    ["places/continents/main/biomes.json", json({ version: 1, areas: [] })],
    ["places/continents/main/plates/0_0.plate", strToU8("plate 8 0 0\n")],
    ["places/continents/main/placed/1_0.json", json({ version: 1, objects: [], slabs: [] })],
    ["places/continents/main/caves/2_0.caves", strToU8("caves 2 2 0\n")],
    ["places/continents/other/plates/5_5.plate", strToU8("plate 8 5 5\n")],
  ]);

  it("reads world.json and the library first, then a continent's platters, biomes, water and cave layout", async () => {
    const { world, fetched } = served(files);
    await world.open();
    expect(world.info.name).toBe("W");
    expect(fetched.map((u) => u.split("c0ffee/")[1]).sort()).toEqual(["objects/abcd1234.json", "world.json"]);
    const main = await world.continent("main");
    expect(main.platters).toHaveLength(1);
    expect(main.biomes).toEqual({ version: 1, areas: [] });
    expect(main.water).toBeNull(); // it hasn't got one, and nothing asked for it
    expect(main.caveLayout).toBeNull();
    expect(fetched.some((u) => u.endsWith("water.json"))).toBe(false);
  });

  it("fetches plate, placed and caves files only where the commit has them", async () => {
    const { world, fetched } = served(files);
    expect(await world.plate("main", [0, 0])).not.toBeNull();
    expect(await world.plate("main", [1, 0])).toBeNull();
    expect(await world.placed("main", [1, 0])).not.toBeNull();
    expect(await world.caves("main", [2, 0])).not.toBeNull();
    expect(await world.caves("main", [0, 0])).toBeNull();
    expect(fetched).toHaveLength(3);
    expect(world.plates("main")).toEqual([[0, 0], [1, 0], [2, 0]]);
  });

  it("won't play a version 1 world", async () => {
    const { world } = served(new Map([["world.json", json({ version: 1, name: "Old", continents: [] })]]));
    await expect(world.open()).rejects.toThrow(/version 1/);
  });

  it("tries again when the network or GitHub fails, but not for a file that isn't there", async () => {
    const answers = [Promise.reject(new TypeError("offline")), { ok: false, status: 503 }, { ok: true, arrayBuffer: async () => strToU8("hi").buffer }];
    const waits = [];
    const world = new PlayWorld({ repo: "me/w", sha: "c0ffee", paths: ["a.txt"], fetchFn: async () => answers.shift(), wait: async (ms) => waits.push(ms) });
    expect(new TextDecoder().decode(await world.bytes("a.txt"))).toBe("hi");
    expect(waits).toEqual([500, 2000]);

    let tries = 0;
    const missing = new PlayWorld({ repo: "me/w", sha: "c0ffee", paths: ["a.txt"], fetchFn: async () => (tries++, { ok: false, status: 404 }), wait: async () => {} });
    await expect(missing.bytes("a.txt")).rejects.toThrow("404");
    expect(tries).toBe(1);

    const down = new PlayWorld({ repo: "me/w", sha: "c0ffee", paths: ["a.txt"], fetchFn: async () => ({ ok: false, status: 502 }), wait: async () => {} });
    await expect(down.bytes("a.txt")).rejects.toThrow("502");
  });
});
