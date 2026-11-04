import { describe, expect, it } from "vitest";
import { absorbBand, initials, timeLeft, UnitStatuses } from "./unitStatuses.js";

describe("UnitStatuses", () => {
  const units = () => {
    const state = { now: 1000 };
    return [new UnitStatuses(() => state.now), state];
  };
  const bleed = { id: -1, status: "bleed", from: 1, class: "paladin1", stacks: 1, lasts: 10 };

  it("keeps what a character holds as it comes into view", () => {
    const [u] = units();
    u.seen({ id: 5, statuses: [{ status: "oath", from: 5, class: "c", stacks: 2 }] });
    expect(u.of(5)).toEqual([{ status: "oath", from: 5, class: "c", stacks: 2, until: null }]);
    u.seen({ id: 5 });
    expect(u.of(5)).toEqual([]);
  });

  it("keeps two casters' copies apart", () => {
    const [u] = units();
    u.on(bleed);
    u.on({ ...bleed, from: 2 });
    u.gone({ id: -1, status: "bleed", from: 1 });
    expect(u.of(-1).map((held) => held.from)).toEqual([2]);
  });

  it("follows stacks and time left", () => {
    const [u, state] = units();
    u.on(bleed);
    state.now = 2000;
    u.changed({ id: -1, status: "bleed", from: 1, stacks: 3, lasts: 4 });
    expect(u.of(-1)[0]).toMatchObject({ stacks: 3, until: 6000 });
    u.changed({ id: -1, status: "bleed", from: 9, stacks: 7, lasts: 4 });
    expect(u.of(-1)[0].stacks).toBe(3);
  });

  it("leaves out what has run out, and puts what never ends first", () => {
    const [u, state] = units();
    u.on(bleed);
    u.on({ ...bleed, status: "short", lasts: 1 });
    u.on({ ...bleed, status: "stays", lasts: 0 });
    expect(u.of(-1).map((held) => held.status)).toEqual(["stays", "short", "bleed"]);
    state.now = 3000;
    expect(u.of(-1).map((held) => held.status)).toEqual(["stays", "bleed"]);
  });

  it("forgets a unit that's gone", () => {
    const [u] = units();
    u.on(bleed);
    u.vanish(-1);
    expect(u.of(-1)).toEqual([]);
  });

  it("knows who can't be targeted", () => {
    const [u] = units();
    u.seen({ id: 5, untargetable: true });
    expect(u.untargetable.has(5)).toBe(true);
    u.targetable({ id: 5, targetable: true });
    expect(u.untargetable.has(5)).toBe(false);
    u.targetable({ id: 6, targetable: false });
    u.vanish(6);
    expect(u.untargetable.has(6)).toBe(false);
  });
});

describe("timeLeft", () => {
  it("reads whole seconds, tenths near the end, and bigger units when it's long", () => {
    expect(timeLeft(null, 0)).toBe("");
    expect(timeLeft(4500, 0)).toBe("4.5");
    expect(timeLeft(12100, 0)).toBe("13");
    expect(timeLeft(90000, 0)).toBe("2m");
    expect(timeLeft(4000000, 0)).toBe("2h");
  });
});

describe("initials", () => {
  it("takes two letters", () => {
    expect(initials("Oath of Vigil")).toBe("OO");
    expect(initials("Arrested")).toBe("AR");
    expect(initials("")).toBe("?");
  });
});

describe("absorbBand", () => {
  it("sits after the health you have, and stays on the bar", () => {
    expect(absorbBand(50, 20, 100)).toEqual([50, 20]);
    expect(absorbBand(90, 20, 100)).toEqual([80, 20]);
    expect(absorbBand(10, 500, 100)).toEqual([0, 100]);
    expect(absorbBand(10, 0, 100)).toEqual([0, 0]);
    expect(absorbBand(10, 10, 0)).toEqual([0, 0]);
  });
});
