import {describe, it, expect, vi, afterEach} from "vitest";
import {BASE_MOB_SPEED, initSimUnit, tickSimUnit} from "../simulateMovement";

// Spawn position deliberately doesn't coincide with step 0 - initSimUnit
// always targets steps[0] first (mirroring initNPCMovement, matching a real
// unit spawning and pathing toward it), so a spawn that already *is* step 0
// (as this editor now seeds a fresh patrol route - see UnitsPanel's
// defaultMovementFor) arrives there instantly on the very first tick,
// which would make "advances toward the target" untestable here.
function patrolUnit(overrides) {
  return {
    position: {x: -5, y: 0, angle: 0},
    movement: {
      type: "patrol", choose: "loop",
      steps: [
        {position: {x: 0, y: 0, angle: 0}, movementRate: 1, waitTime: 0},
        {position: {x: 10, y: 0, angle: 0}, movementRate: 1, waitTime: 0},
      ],
      ...overrides,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("simulateMovement", () => {
  it("a still unit stays idle at its authored position", () => {
    const unit = {position: {x: 5, y: 5, angle: 0}, movement: {type: "still"}};
    const sim = initSimUnit(unit);
    expect(sim).toMatchObject({x: 5, y: 5, phase: "idle"});

    tickSimUnit(sim, unit, BASE_MOB_SPEED, 1);
    expect(sim).toMatchObject({x: 5, y: 5, phase: "idle"});
  });

  it("a patrol unit with fewer than 2 steps stays idle", () => {
    const unit = patrolUnit({steps: [{position: {x: 0, y: 0, angle: 0}, movementRate: 1, waitTime: 0}]});
    const sim = initSimUnit(unit);
    expect(sim.phase).toBe("idle");
  });

  it("moves a patrol unit toward its first step's position on init", () => {
    const unit = {
      position: {x: 0, y: 0, angle: 0},
      movement: {type: "patrol", choose: "loop", steps: [
        {position: {x: 10, y: 0, angle: 0}, movementRate: 1, waitTime: 0},
        {position: {x: 20, y: 0, angle: 0}, movementRate: 1, waitTime: 0},
      ]},
    };
    const sim = initSimUnit(unit);
    expect(sim.phase).toBe("moving");
    expect(sim.targetX).toBe(10);
    expect(sim.targetY).toBe(0);
  });

  it("advances toward the target at speed*moveRate*dt, without overshooting", () => {
    const unit = patrolUnit();
    const sim = initSimUnit(unit); // spawns at (-5,0), targeting step 0 at (0,0)

    tickSimUnit(sim, unit, 10, 0.1); // 10ft/s * 1.0 rate * 0.1s = 1ft
    expect(sim.x).toBeCloseTo(-4, 5);
    expect(sim.y).toBeCloseTo(0, 5);
    expect(sim.phase).toBe("moving");
  });

  it("arrives exactly at the target and advances to the next step (loop, wait=0)", () => {
    const unit = patrolUnit();
    const sim = initSimUnit(unit); // targeting step 0 at (0,0)

    tickSimUnit(sim, unit, 10, 100); // huge dt guarantees arrival this tick

    // Arrives at step 0's position, then - since its waitTime is 0 -
    // immediately retargets step 1 for the *next* tick (one tick only ever
    // resolves one leg transition, even with a huge dt - matches the real
    // server, which never re-arrives more than once within a single tick).
    expect(sim.x).toBe(0);
    expect(sim.y).toBe(0);
    expect(sim.patrolStepIndex).toBe(1);
    expect(sim.targetX).toBe(10);
    expect(sim.targetY).toBe(0);
    expect(sim.phase).toBe("moving");
  });

  it("enters a waiting phase at a step with waitTime > 0, then resumes after it elapses", () => {
    const unit = patrolUnit({steps: [
      {position: {x: 0, y: 0, angle: 0}, movementRate: 1, waitTime: 2},
      {position: {x: 10, y: 0, angle: 0}, movementRate: 1, waitTime: 0},
    ]});
    const sim = initSimUnit(unit); // targeting step 0 at (0,0), which has waitTime 2

    tickSimUnit(sim, unit, 10, 100); // arrives at step 0 - waitTime 2 means it waits instead of retargeting
    expect(sim.x).toBe(0);
    expect(sim.phase).toBe("waiting");
    expect(sim.waitRemaining).toBeCloseTo(2, 5);

    tickSimUnit(sim, unit, 10, 1);
    expect(sim.phase).toBe("waiting");
    expect(sim.waitRemaining).toBeCloseTo(1, 5);

    tickSimUnit(sim, unit, 10, 1.5); // more than remaining -> resumes moving
    expect(sim.phase).toBe("moving");
    expect(sim.targetX).toBe(10);
  });

  it("'return' choose mode reverses direction at each end instead of wrapping", () => {
    const unit = {
      position: {x: -5, y: 0, angle: 0},
      movement: {type: "patrol", choose: "return", steps: [
        {position: {x: 0, y: 0, angle: 0}, movementRate: 1, waitTime: 0},
        {position: {x: 10, y: 0, angle: 0}, movementRate: 1, waitTime: 0},
        {position: {x: 20, y: 0, angle: 0}, movementRate: 1, waitTime: 0},
      ]},
    };
    const sim = initSimUnit(unit); // targeting step 0 at (0,0)

    tickSimUnit(sim, unit, 10, 100); // arrive at step 0, advance to step 1
    expect(sim.patrolStepIndex).toBe(1);
    expect(sim.targetX).toBe(10);

    tickSimUnit(sim, unit, 10, 100); // arrive at step 1, advance to step 2 (the end)
    expect(sim.patrolStepIndex).toBe(2);
    expect(sim.targetX).toBe(20);

    tickSimUnit(sim, unit, 10, 100); // arrive at step 2 (the end) - direction reverses
    expect(sim.patrolStepIndex).toBe(1); // now heading back toward step 1
    expect(sim.targetX).toBe(10);
  });

  it("a wander unit picks a target within its radius and eventually arrives", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // deterministic: angle 0, dist 0 -> target == location
    const unit = {
      position: {x: 5, y: 5, angle: 0},
      movement: {type: "wander", location: {x: 20, y: 20}, radius: 5, speed: 1, waitTime: 0},
    };
    const sim = initSimUnit(unit);
    expect(sim.phase).toBe("moving");
    expect(sim.targetX).toBeCloseTo(20, 5);
    expect(sim.targetY).toBeCloseTo(20, 5);

    tickSimUnit(sim, unit, 10, 100);
    expect(sim.x).toBeCloseTo(20, 5);
    expect(sim.y).toBeCloseTo(20, 5);
    expect(sim.phase).toBe("moving"); // waitTime 0 -> immediately picks a new target
  });

  it("a wander unit with no location stays idle", () => {
    const unit = {position: {x: 0, y: 0, angle: 0}, movement: {type: "wander", radius: 5, speed: 1, waitTime: 0}};
    const sim = initSimUnit(unit);
    expect(sim.phase).toBe("idle");
  });
});
