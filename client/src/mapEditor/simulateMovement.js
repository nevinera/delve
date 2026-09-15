// Client-side re-implementation of the game server's patrol/wander state
// machine (game-server/internal/instance/npc_movement.go), for the map
// editor's Simulate Units mode - a read-only preview with no server
// connection, so this doesn't share code with the Go original. Deliberately
// skips the real server's smooth turning-animation phase (facing snaps
// instantly on arrival instead of interpolating over turnDuration) - not
// needed to see units actually move around, and cuts real complexity out of
// this first pass.
export const BASE_MOB_SPEED = 10; // feet/sec - matches game-server's BaseMobSpeed

function randInCircle(cx, cy, r) {
  const angle = Math.random() * 2 * Math.PI;
  const dist = Math.sqrt(Math.random()) * r;
  return {x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist};
}

// Mirrors sampleRange/sampleRangePtr - a value is either a bare number or a
// [min, max] pair (docs/schema/unit.md's float | floatRange), sampled
// uniformly; undefined/null falls back to def.
function sampleRange(value, def = 0) {
  if (value == null) return def;
  if (Array.isArray(value)) {
    const [lo, hi] = value;
    return lo >= hi ? lo : lo + Math.random() * (hi - lo);
  }
  return value;
}

function facingTowardDeg(x1, y1, x2, y2) {
  return (Math.atan2(x2 - x1, y2 - y1) * 180) / Math.PI;
}

// Mirrors nextPatrolStep - picks the next step index and updates
// sim.patrolDir for "return" mode. Mutates sim.patrolDir in place, same as
// the Go version mutates BehaviorState.PatrolDir.
function nextPatrolStep(sim, n, choose) {
  switch (choose) {
    case "loop":
      return (sim.patrolStepIndex + 1) % n;
    case "return": {
      let dir = sim.patrolDir || 1;
      let next = sim.patrolStepIndex + dir;
      if (next >= n) {
        dir = -1;
        next = n - 2;
      } else if (next < 0) {
        dir = 1;
        next = 1;
      }
      sim.patrolDir = dir;
      return Math.max(0, Math.min(n - 1, next));
    }
    case "random": {
      if (n <= 1) return 0;
      let idx = Math.floor(Math.random() * (n - 1));
      if (idx >= sim.patrolStepIndex) idx += 1;
      return idx;
    }
    default:
      return 0;
  }
}

function beginPatrolLeg(sim, movement, stepIndex) {
  const step = movement.steps[stepIndex];
  sim.patrolStepIndex = stepIndex;
  sim.angle = facingTowardDeg(sim.x, sim.y, step.position.x, step.position.y);
  sim.targetX = step.position.x;
  sim.targetY = step.position.y;
  sim.moveRate = step.movementRate;
}

function beginWanderLeg(sim, movement) {
  const target = randInCircle(movement.location.x, movement.location.y, movement.radius ?? 0);
  sim.angle = facingTowardDeg(sim.x, sim.y, target.x, target.y);
  sim.targetX = target.x;
  sim.targetY = target.y;
  sim.moveRate = sampleRange(movement.speed, 1.0);
}

function beginNextLeg(sim, movement) {
  if (movement.type === "patrol") {
    beginPatrolLeg(sim, movement, nextPatrolStep(sim, movement.steps.length, movement.choose));
  } else {
    beginWanderLeg(sim, movement);
  }
}

// Mirrors npcArriveAtTarget - either starts the next leg immediately (wait
// <= 0) or enters the waiting phase.
function arriveAtTarget(sim, movement) {
  const wait = movement.type === "patrol"
    ? sampleRange(movement.steps[sim.patrolStepIndex].waitTime, 0)
    : sampleRange(movement.waitTime, 0);
  if (wait <= 0) {
    beginNextLeg(sim, movement);
    sim.phase = "moving";
  } else {
    sim.waitRemaining = wait;
    sim.phase = "waiting";
  }
}

// Builds a unit's initial sim state from its authored position/movement -
// mirrors initNPCMovement. A unit whose movement doesn't actually resolve to
// motion (still, or a patrol with < 2 steps, or a wander with no location)
// stays "idle" at its authored position.
export function initSimUnit(unit) {
  const movement = unit.movement;
  const sim = {x: unit.position.x, y: unit.position.y, angle: unit.position.angle ?? 0, phase: "idle"};

  if (movement?.type === "patrol" && (movement.steps?.length ?? 0) >= 2) {
    sim.patrolDir = 1;
    beginPatrolLeg(sim, movement, 0);
    sim.phase = "moving";
  } else if (movement?.type === "wander" && movement.location) {
    beginWanderLeg(sim, movement);
    sim.phase = "moving";
  }

  return sim;
}

// Advances one tick - mirrors tickNPCMovement, minus the turning-animation
// phase (see the module comment). Mutates and returns sim. speedFeetPerSec
// is the unit's real feet/sec (BASE_MOB_SPEED * its unit type's
// speedFactor - see MapEditor's simulation loop); dt is real seconds
// elapsed, already scaled by the speed multiplier.
export function tickSimUnit(sim, unit, speedFeetPerSec, dt) {
  const movement = unit.movement;
  if (!movement || sim.phase === "idle") return sim;

  if (sim.phase === "waiting") {
    sim.waitRemaining -= dt;
    if (sim.waitRemaining <= 0) {
      beginNextLeg(sim, movement);
      sim.phase = "moving";
    }
    return sim;
  }

  const dx = sim.targetX - sim.x;
  const dy = sim.targetY - sim.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const move = speedFeetPerSec * sim.moveRate * dt;

  if (dist <= move || dist < 0.01) {
    sim.x = sim.targetX;
    sim.y = sim.targetY;
    arriveAtTarget(sim, movement);
  } else {
    sim.x += (dx / dist) * move;
    sim.y += (dy / dist) * move;
  }

  return sim;
}
