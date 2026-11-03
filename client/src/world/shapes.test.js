import { gzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { generateTile, prepareWorld } from "./generator.js";
import { LandGrid, PER_TILE } from "./landGrid.js";
import { makeObject, setBuiltObjects } from "./objects.js";
import { encodeTile } from "./tileCodec.js";
import { blocksSight, meshOf, objectMesh, shapesFile, shapesText } from "./shapes.js";
import { World } from "./world.js";

// A crate of six boards, and a lamp post you see through.
const crate = {
  id: "crate001",
  name: "crate",
  palette: [{ color: "#8a6a44" }],
  pieces: [
    { type: "box", size: [2, 0.1, 2], at: [0, 0.05, 0], turn: [0, 0, 0], color: 0 },
    { type: "box", size: [2, 0.1, 2], at: [0, 1.95, 0], turn: [0, 0, 0], color: 0 },
    { type: "box", size: [0.1, 2, 2], at: [-0.95, 1, 0], turn: [0, 0, 0], color: 0 },
    { type: "box", size: [0.1, 2, 2], at: [0.95, 1, 0], turn: [0, 0, 0], color: 0 },
    { type: "box", size: [2, 2, 0.1], at: [0, 1, -0.95], turn: [0, 0, 0], color: 0 },
    { type: "box", size: [2, 2, 0.1], at: [0, 1, 0.95], turn: [0, 0, 0], color: 0 },
  ],
};
const lamp = { id: "lamp0001", name: "lamp", blocksSight: false, palette: [{ color: "#333333" }], pieces: [{ type: "cylinder", size: [0.3, 8, 0.3], at: [0, 4, 0], turn: [0, 0, 0], color: 0 }] };

// Whether the segment from a to b crosses one of the mesh's faces.
function crosses({ points, faces }, a, b) {
  const sub = (p, q) => p.map((v, i) => v - q[i]);
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const dir = sub(b, a);
  return faces.some((loop) =>
    loop.slice(1, -1).some((_, i) => {
      const [p0, p1, p2] = [points[loop[0]], points[loop[i + 1]], points[loop[i + 2]]];
      const [e1, e2] = [sub(p1, p0), sub(p2, p0)];
      const h = cross(dir, e2);
      const det = dot(e1, h);
      if (Math.abs(det) < 1e-12) return false;
      const s = sub(a, p0);
      const q = cross(s, e1);
      const [u, v, t] = [dot(s, h) / det, dot(dir, q) / det, dot(e2, q) / det];
      return u >= 0 && v >= 0 && u + v <= 1 && t >= 0 && t <= 1;
    }),
  );
}

describe("shapes", () => {
  setBuiltObjects([crate, lamp]);

  it("knows which kinds block sight", () => {
    expect(blocksSight("built:crate001")).toBe(true);
    expect(blocksSight("built:lamp0001")).toBe(false);
    expect(blocksSight("boulder")).toBe(true);
    expect(blocksSight("bush")).toBe(false);
    expect(blocksSight("nothing")).toBe(false);
  });

  it("wraps a built object's boards in one box", () => {
    const hull = meshOf("built:crate001");
    expect(hull.points).toHaveLength(8);
    expect(hull.faces).toHaveLength(6);
    expect(Math.min(...hull.points.map((p) => p[1]))).toBe(0);
    expect(Math.max(...hull.points.map((p) => p[1]))).toBe(2);
  });

  it("cuts holes through it by hand", () => {
    const window = { along: [0, 0, -1], outline: [[-0.5, 0.5, 0], [0.5, 0.5, 0], [0.5, 1.5, 0], [-0.5, 1.5, 0]] };
    const mesh = objectMesh({ ...crate, sightCuts: [window] });
    expect(mesh.faces.length).toBeGreaterThan(6);
    expect(mesh.faces.every((f) => f.length === 3)).toBe(true);
  });

  it("sees through the built-in arch's opening, not its pillars", () => {
    setBuiltObjects([]);
    const arch = meshOf("built:bruin012");
    expect(crosses(arch, [0, 5, 20], [0, 5, -20])).toBe(false);
    expect(crosses(arch, [4, 5, 20], [4, 5, -20])).toBe(true);
    expect(crosses(arch, [0, 12, 20], [0, 12, -20])).toBe(true);
    setBuiltObjects([crate, lamp]);
  });

  it("stands a code-made kind up as a prism over its footprint, sunk as it's drawn", () => {
    // A boulder at scale 1 is 0.8 tall and sinks a tenth of that.
    const ys = meshOf("boulder").points.map((p) => p[1]);
    expect(Math.min(...ys)).toBe(-0.08);
    expect(Math.max(...ys)).toBe(0.72);
  });

  it("keeps the kinds that block sight, sorted, a line each", () => {
    const file = shapesFile(["boulder", "built:lamp0001", "bush", "built:crate001", "boulder"]);
    expect(Object.keys(file.kinds)).toEqual(["boulder", "built:crate001"]);
    const text = shapesText(file);
    expect(JSON.parse(text)).toEqual(file);
    expect(text.split("\n")).toHaveLength(8);
    expect(shapesText(shapesFile([]))).toBe('{\n  "version": 1,\n  "kinds": {}\n}\n');
  });

  it("is written with the plates, for the kinds they place", async () => {
    const land = new LandGrid();
    for (let gz = -PER_TILE; gz <= 2 * PER_TILE; gz++) for (let gx = -PER_TILE; gx <= 2 * PER_TILE; gx++) land.set(gx, gz, 40);
    const ctx = prepareWorld({ land: land.data, pins: [], paths: [], water: { rivers: [], lakes: [] } }, "t");
    const tile = generateTile(ctx, 0, 0);
    tile.objects = [makeObject("built:crate001", [100, 100], 0, 1), makeObject("bush", [200, 200], 0, 4)].map((o, n) => ({ ...o, id: `0.0.${n}` }));
    const world = World.empty();
    world.files.set("places/continents/main/tiles/surface/0/0.dlt.gz", gzipSync(encodeTile(tile)));
    world.writeJson("objects/crate001.json", crate);
    world.writeJson("collections.json", { collections: [] });
    const stored = await world.stored();
    const { kinds } = JSON.parse(strFromU8(stored.get("shapes.json")));
    expect(Object.keys(kinds)).toEqual(["built:crate001"]);
  });
});
