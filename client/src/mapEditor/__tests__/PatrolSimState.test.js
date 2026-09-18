import {describe, it, expect} from "vitest";
import {PatrolSimState} from "../PatrolSimState";
import {BASE_MOB_SPEED} from "../simulateMovement";

function stillUnit(x, y) {
  return {position: {x, y, angle: 0}, movement: {type: "still"}};
}

// Step 0 is deliberately *not* the unit's own starting position - if it
// were, initSimUnit's own seeded target would already be "reached" (dist
// 0), and the first tick would spend itself transitioning to step 1
// instead of showing real movement toward step 0.
function patrolUnit() {
  return {
    unitType: "goblin-raider",
    position: {x: 0, y: 0, angle: 0},
    movement: {type: "patrol", choose: "loop", steps: [{position: {x: 100, y: 0}, movementRate: 1, waitTime: 0}, {position: {x: 200, y: 0}, movementRate: 1, waitTime: 0}]},
  };
}

describe("PatrolSimState", () => {
  it("starts not running, with no positions", () => {
    const sim = new PatrolSimState();
    expect(sim.running).toBe(false);
    expect(sim.positions).toBeNull();
    expect(sim.speed).toBe(1);
  });

  describe("start", () => {
    it("seeds sim state from each unit's authored position and returns the initial positions", () => {
      const sim = new PatrolSimState();
      const positions = sim.start([stillUnit(5, 5), stillUnit(10, 10)]);

      expect(sim.running).toBe(true);
      expect(positions).toEqual([{x: 5, y: 5, angle: 0}, {x: 10, y: 10, angle: 0}]);
      expect(sim.positions).toBe(positions);
    });
  });

  describe("stop", () => {
    it("clears running and positions", () => {
      const sim = new PatrolSimState();
      sim.start([stillUnit(0, 0)]);

      sim.stop();

      expect(sim.running).toBe(false);
      expect(sim.positions).toBeNull();
    });
  });

  describe("tick", () => {
    it("leaves a still unit exactly where it started", () => {
      const sim = new PatrolSimState();
      const units = [stillUnit(5, 5)];
      sim.start(units);

      const positions = sim.tick(units, {}, 1.0);

      expect(positions).toEqual([{x: 5, y: 5, angle: 0}]);
    });

    it("moves a patrolling unit toward its next step, using BASE_MOB_SPEED * speedFactor", () => {
      const sim = new PatrolSimState();
      const units = [patrolUnit()];
      sim.start(units);

      const positions = sim.tick(units, {"goblin-raider": {speedFactor: 2.0}}, 1.0);

      // moves BASE_MOB_SPEED * 2.0 * 1.0 feet toward (100, 0) from (0, 0)
      expect(positions[0].x).toBeCloseTo(BASE_MOB_SPEED * 2.0);
      expect(positions[0].y).toBeCloseTo(0);
    });

    it("defaults to a speedFactor of 1.0 when unitTypeDetails has no entry for the unit", () => {
      const sim = new PatrolSimState();
      const units = [patrolUnit()];
      sim.start(units);

      const positions = sim.tick(units, {}, 1.0);

      expect(positions[0].x).toBeCloseTo(BASE_MOB_SPEED);
    });

    it("scales dt by the current speed multiplier", () => {
      const sim = new PatrolSimState();
      const units = [patrolUnit()];
      sim.start(units);
      sim.setSpeed(3);

      const positions = sim.tick(units, {}, 1.0);

      expect(positions[0].x).toBeCloseTo(BASE_MOB_SPEED * 3);
    });

    it("updates sim.positions in place, matching the returned array", () => {
      const sim = new PatrolSimState();
      const units = [stillUnit(0, 0)];
      sim.start(units);

      const positions = sim.tick(units, {}, 0.5);

      expect(sim.positions).toBe(positions);
    });
  });
});
