import {describe, it, expect, vi} from "vitest";
import {CellGroundQueue, GROUND_PIXELS_PER_FOOT, groundPixelsPerFoot} from "../cellGrounds";

const feet = {width: 100, height: 50};

function queue() {
  const rendered = [];
  const grounds = [];
  const q = new CellGroundQueue({
    pixelsPerFoot: () => 4,
    onGround: (mapId, canvas, canopy) => grounds.push(canopy ? [mapId, canvas, canopy] : [mapId, canvas]),
    render: async (cellMap, ppf, {layers}) => {
      rendered.push([cellMap.name, ppf]);
      return {canvas: `canvas:${cellMap.name}`, canopy: layers ? `canopy:${cellMap.name}` : null};
    },
  });
  for (const name of ["a", "b", "c"]) q.add(name, {name}, feet, {layers: name === "c"});
  return {q, rendered, grounds};
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("CellGroundQueue", () => {
  it("renders nothing until a map is wanted, then that one first and the rest after", async () => {
    const {q, rendered, grounds} = queue();
    await settle();
    expect(rendered).toEqual([]);
    q.prefer("b");
    await settle();
    expect(rendered.map(([name]) => name)).toEqual(["b", "a", "c"]);
    expect(grounds).toEqual([["b", "canvas:b"], ["a", "canvas:a"], ["c", "canvas:c", "canopy:c"]]);
    expect(rendered[0][1]).toBe(4);
  });

  it("switches to a newly wanted map between renders", async () => {
    const {q, rendered} = queue();
    q.prefer("a");
    q.prefer("c");
    await settle();
    expect(rendered.map(([name]) => name)).toEqual(["a", "c", "b"]);
  });

  it("stops", async () => {
    const {q, grounds} = queue();
    q.prefer("a");
    q.stop();
    await settle();
    expect(grounds).toEqual([]);
  });

  it("carries on past a failed render", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const grounds = [];
    const q = new CellGroundQueue({pixelsPerFoot: () => 4, onGround: (id) => grounds.push(id), render: async ({name}) => {
      if (name === "a") throw new Error("nope");
      return name;
    }});
    q.add("a", {name: "a"}, feet);
    q.add("b", {name: "b"}, feet);
    q.prefer("a");
    await settle();
    expect(grounds).toEqual(["b"]);
  });
});

describe("groundPixelsPerFoot", () => {
  it("fits the texture limit", () => {
    expect(groundPixelsPerFoot(feet, 16384)).toBe(GROUND_PIXELS_PER_FOOT);
    expect(groundPixelsPerFoot({width: 1000, height: 800}, 4096)).toBeCloseTo(4.096);
  });
});
