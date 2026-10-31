import { strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { PLATE_FT } from "../v2/sizes.js";
import { Placed, placedPath, readyObject } from "./placed.js";
import { Things } from "./things.js";

const boulder = (x, z) => readyObject({ type: "boulder", at: [x, z], yaw: 0, scale: 4, colors: [[0.5, 0.5, 0.5]] });
const floor = (x, y, z, w = 20) => ({ at: [x, y, z], turn: [0, 0, 0], outline: [[0, 0], [w, 0], [w, w], [0, w]], thickness: 1, surface: "floorboards" });
// A wall along x from (x, z), 20 ft long and 10 tall, standing on y.
const wall = (x, y, z) => ({ at: [x, y, z], turn: [0, -90, 0], outline: [[0, 0], [20, 0], [20, 10], [0, 10]], thickness: 1, surface: "stone" });

describe("placed things", () => {
  it("keeps each thing in the plate it's in, and saves those changed", () => {
    const placed = new Placed();
    placed.put([boulder(10, 10), boulder(PLATE_FT + 10, 10), floor(5, 0, PLATE_FT * 2 + 5)]);
    expect([...placed.plates.keys()].sort()).toEqual(["0,0", "0,2", "1,0"]);
    const files = placed.unsavedFiles("main");
    expect(files.size).toBe(3);
    const json = JSON.parse(strFromU8(files.get(placedPath("main", [0, 0]))));
    expect(json.objects).toEqual([{ type: "boulder", at: [10, 10], yaw: 0, scale: 4, colors: [[0.5, 0.5, 0.5]] }]);
    expect(placed.unsavedFiles("main").size).toBe(0);
  });

  it("reads its files back as they were saved", () => {
    const placed = new Placed();
    placed.put([boulder(10, 10), floor(5, 2, 5)]);
    const again = new Placed();
    for (const [path, bytes] of placed.unsavedFiles("main")) again.load([0, 0], bytes, path);
    expect(again.plate("0,0").objects[0].footprint).toEqual(placed.plate("0,0").objects[0].footprint);
    expect(again.plate("0,0").slabs).toEqual(placed.plate("0,0").slabs);
  });

  it("moves a thing to the plate it's moved into, and undoes changes in turn", () => {
    const placed = new Placed();
    const rock = boulder(10, 10);
    placed.put([rock]);
    placed.alter([rock], (o) => (o.at = [PLATE_FT + 5, 10]));
    placed.alter([rock], (o) => (o.at = [PLATE_FT + 50, 10]), true);
    expect(placed.plate("0,0").objects).toEqual([]);
    expect(placed.plate("1,0").objects).toEqual([rock]);
    placed.take([rock]);
    expect(placed.plate("1,0").objects).toEqual([]);
    placed.undo();
    expect(placed.plate("1,0").objects).toEqual([rock]);
    // The drag undoes as one.
    placed.undo();
    expect(rock.at).toEqual([10, 10]);
    expect(placed.plate("0,0").objects).toEqual([rock]);
    placed.undo();
    expect(placed.plate("0,0").objects).toEqual([]);
    expect(placed.undo()).toBe(false);
  });
});

describe("walking among things", () => {
  const placed = new Placed();
  placed.put([floor(0, 2, 0), wall(0, 2, 40), boulder(100, 100)]);
  const things = new Things({ add() {} }, placed, () => 0);

  it("stands on a slab's top it can step up to, and not one far over its head", () => {
    expect(things.standAt(10, 10, 2.5)).toBe(2);
    expect(things.standAt(10, 10, 1)).toBe(0);
    expect(things.standAt(30, 10, 2.5)).toBe(0);
  });

  it("is kept out of walls and objects, but not ones under its feet", () => {
    const [, z] = things.pushOut(10, 40.2, 0, 1);
    expect(Math.abs(z - 40.5)).toBeGreaterThan(1);
    expect(things.pushOut(10, 40.2, 20, 1)).toEqual([10, 40.2]);
    const [x] = things.pushOut(101, 100, 0, 1);
    expect(x).toBeGreaterThan(101);
  });
});
