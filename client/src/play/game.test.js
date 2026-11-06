import { describe, expect, it } from "vitest";
import { movementOf, nextReport } from "./game.js";

const walker = (keys, more = {}) => ({ held: new Set(keys), gait: "run", motion: {}, ...more });
const still = { forward: 0, strafe: 0, turn: 0, gait: "run", swim: false, jump: false };

describe("movementOf", () => {
  it("reads the keys held", () => {
    expect(movementOf(walker(["w", "q", "d"]))).toEqual({ forward: 1, strafe: 1, turn: -1, gait: "run", swim: false, jump: false });
    expect(movementOf(walker(["s", "e", "a"], { gait: "walk" }))).toMatchObject({ forward: -1, strafe: -1, turn: 1, gait: "walk" });
  });

  it("runs unless it's walking, and in the water too", () => {
    expect(movementOf(walker([])).gait).toBe("run");
    expect(movementOf(walker([], { motion: { swimming: true } }))).toMatchObject({ gait: "run", swim: true });
  });
});

describe("nextReport", () => {
  const last = { move: still, yaw: 0, at: 1000 };

  it("sends a move first, and when the movement changes or a jump starts", () => {
    expect(nextReport(null, still, 0, false, 0)).toBe("move");
    expect(nextReport(last, { ...still, forward: 1 }, 0, false, 1100)).toBe("move");
    expect(nextReport(last, still, 0, true, 1100)).toBe("move");
  });

  it("sends heartbeats twice a second on the move and once a second standing still", () => {
    const running = { ...still, forward: 1 };
    const sent = { ...last, move: running };
    expect(nextReport(sent, running, 0, false, 1400)).toBe(null);
    expect(nextReport(sent, running, 0, false, 1500)).toBe("heartbeat");
    expect(nextReport(last, still, 0, false, 1500)).toBe(null);
    expect(nextReport(last, still, 0, false, 2000)).toBe("heartbeat");
    // Turned by dragging, with no keys held.
    expect(nextReport(last, still, 0.3, false, 1500)).toBe("heartbeat");
  });
});
