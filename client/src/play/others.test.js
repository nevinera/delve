import { describe, expect, it } from "vitest";
import { levelColor, nameWithLevel, Others, speedOf, stepOf } from "./others.js";

const move = (m) => ({ forward: 0, strafe: 0, turn: 0, gait: "run", swim: false, jump: false, ...m });

describe("speedOf", () => {
  it("goes at the game's speeds", () => {
    expect(speedOf(move({}))).toBe(0);
    expect(speedOf(move({ forward: 1 }))).toBe(21);
    expect(speedOf(move({ forward: 1, gait: "walk" }))).toBe(7.5);
    expect(speedOf(move({ forward: -1 }))).toBe(13.5);
    expect(speedOf(move({ strafe: 1, gait: "sprint" }))).toBe(21); // a gait it doesn't know runs
    expect(speedOf(move({ forward: 1, swim: true }))).toBe(14.2);
  });
});

describe("stepOf", () => {
  it("goes the way the character faces, and left when strafing left", () => {
    const [dx, dz] = stepOf(move({ forward: 1 }), 0, 1);
    expect([dx, dz]).toEqual([0, 21]);
    const [lx, lz] = stepOf(move({ strafe: 1 }), 0, 1);
    expect(lx).toBeCloseTo(21);
    expect(lz).toBeCloseTo(0);
  });

  it("goes no faster on the diagonal", () => {
    const [dx, dz] = stepOf(move({ forward: 1, strafe: 1 }), 1, 1);
    expect(Math.hypot(dx, dz)).toBeCloseTo(21);
  });
});

describe("gear", () => {
  const seen = (drawn) => {
    const shown = [];
    const others = { characters: new Map([[1, drawn]]), look: (message) => shown.push(message) };
    Others.prototype.gear.call(others, { id: 1, look: { weapon: "maul" } });
    return shown;
  };

  it("shows what someone holds now", () => {
    const drawn = { own: {} };
    expect(seen(drawn)).toEqual([{ id: 1, look: null }]);
    expect(drawn.own).toEqual({ weapon: "maul" });
  });

  it("waits until someone looks like themselves again", () => {
    const drawn = { own: {}, transformed: true };
    expect(seen(drawn)).toEqual([]);
    expect(drawn.own).toEqual({ weapon: "maul" });
  });
});

describe("nameWithLevel", () => {
  it("puts a mob's level after its name, but not a player's or a training dummy's", () => {
    expect(nameWithLevel({ id: -2, name: "Goblin", level: 3 })).toBe("Goblin (3)");
    expect(nameWithLevel({ id: 7, name: "Ann", level: 3 })).toBe("Ann");
    expect(nameWithLevel({ id: -1, name: "Training Dummy", dummy: true })).toBe("Training Dummy");
  });
});

describe("levelColor", () => {
  it("goes from grey for far under you to red for far over", () => {
    expect([1, 4, 5, 8, 10, 12, 13, 14, 15, 20].map((level) => levelColor(level, 10))).toEqual(["#a6a6a6", "#a6a6a6", "#5fd35f", "#ffd84d", "#ffd84d", "#ffd84d", "#ff9a2e", "#ff9a2e", "#ff4d3d", "#ff4d3d"]);
  });
  it("is white when it doesn't know a level", () => {
    expect(levelColor(3, null)).toBe("#ffffff");
  });
});
