import { describe, expect, it } from "vitest";
import { MapPins, pinTrouble, readMapPins } from "./mapPins.js";

const pin = (id, more = {}) => ({ id, name: "The Old Mine", type: "cave", at: [1, 2], ...more });

describe("map pins", () => {
  it("say what's wrong with a pin", () => {
    expect(pinTrouble(pin("old-mine"))).toBe("");
    expect(pinTrouble(pin("Old Mine"))).toMatch(/lowercase/);
    expect(pinTrouble(pin("old-mine"), [pin("old-mine")])).toMatch(/already/);
    expect(pinTrouble(pin("a", { name: " " }))).toMatch(/name/);
    expect(pinTrouble(pin("a", { type: "town" }))).toMatch(/place or cave/);
  });

  it("read a file, leaving out pins that aren't whole", () => {
    const pins = readMapPins({ version: 1, pins: [pin("a"), pin("a"), pin("b", { at: [1] }), pin("c", { type: "place" })] });
    expect(pins.map((p) => p.id)).toEqual(["a", "c"]);
    expect(readMapPins(null)).toEqual([]);
  });

  it("put pins in, change them and take them away, counting each as a change", () => {
    const store = new MapPins();
    store.load({ version: 1, pins: [pin("a")] });
    expect(store.version).toBe(0);
    const [a] = store.pins;
    expect(store.set(pin("b"))).toBe("");
    expect(store.set(pin("b"))).toMatch(/already/);
    expect(store.set(pin("a2", { name: "Renamed" }), a)).toBe("");
    expect(store.pins.map((p) => p.id)).toEqual(["a2", "b"]);
    store.remove(store.pins[1]);
    expect(store.toJSON()).toEqual({ version: 1, pins: [{ id: "a2", name: "Renamed", type: "cave", at: [1, 2] }] });
    expect(store.version).toBe(3);
  });
});
