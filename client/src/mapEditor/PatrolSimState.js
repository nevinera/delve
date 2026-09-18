import {BASE_MOB_SPEED, initSimUnit, tickSimUnit} from "./simulateMovement";

// Simulate Units mode's (Slice 9) engine - a read-only preview of
// patrol/wander movement, running entirely client-side (the editor has no
// live game-server connection to actually watch). Unlike every draft class
// in this codebase (MapDraft/UiState/...), this is deliberately *mutable*:
// simulateMovement.js's own `tickSimUnit` is documented as mutate-and-return
// (mirroring the Go server's own mutation style), and allocating a fresh
// immutable snapshot of every unit's internal sim state 60 times a second
// would fight that for no testability gain. Held in a ref (see
// MapEditor.jsx), the same "stateful engine instance" pattern GithubClient
// already uses - not the value-object pattern the other draft classes use.
//
// `positions` (the rendered overlay - {x, y, angle} per unit, parallel to
// the map's own units array) is the one piece of state that actually needs
// to trigger a React re-render; #start/#tick both return it explicitly so
// the caller can hand it to a state setter, rather than this class trying
// to talk to React itself.
export class PatrolSimState {
  constructor() {
    this.running = false;
    this.speed = 1;
    this.positions = null;
    this.simUnits = [];
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  start(units) {
    this.simUnits = units.map(initSimUnit);
    this.positions = this.simUnits.map((sim) => ({x: sim.x, y: sim.y, angle: sim.angle}));
    this.running = true;
    return this.positions;
  }

  stop() {
    this.running = false;
    this.positions = null;
  }

  // Advances every unit by dt real seconds (already clamped by the caller
  // against a backgrounded/throttled tab - see MapEditor.jsx), scaled by
  // this.speed. unitTypeDetails supplies each unit's speedFactor
  // (BASE_MOB_SPEED * speedFactor is the unit's real feet/sec, matching the
  // real game server's BaseMobSpeed usage).
  tick(units, unitTypeDetails, dt) {
    const scaledDt = dt * this.speed;
    this.simUnits.forEach((sim, i) => {
      const unit = units[i];
      const speedFactor = unitTypeDetails[unit.unitType]?.speedFactor ?? 1.0;
      tickSimUnit(sim, unit, BASE_MOB_SPEED * speedFactor, scaledDt);
    });
    this.positions = this.simUnits.map((sim) => ({x: sim.x, y: sim.y, angle: sim.angle}));
    return this.positions;
  }
}
