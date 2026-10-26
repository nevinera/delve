// Day and night (plans/design.md, "Day/night"): one shared clock, so everyone sees the same sky and
// the server agrees with no messages. A cycle runs dawn, day, dusk and night; the sun rises halfway
// through dawn and sets halfway through dusk, crossing the southern sky from east to west, and is
// below the horizon for the rest. The moon runs the same path, falling behind the sun by a full
// turn each lunar month, so it's new beside the sun and full opposite it.
//
// Positions are cycles since the epoch: the whole part counts days, the fraction is the time of day.

export const PHASES = [
  ["dawn", 10],
  ["day", 115],
  ["dusk", 10],
  ["night", 60],
]; // minutes
export const CYCLE_MINUTES = PHASES.reduce((sum, [, minutes]) => sum + minutes, 0);
export const CYCLE_MS = CYCLE_MINUTES * 60 * 1000;
export const LUNAR_DAYS = 8;
const EPOCH_MS = Date.UTC(2026, 0, 1);
// How high the sun's path climbs, from straight up toward the south.
export const PATH_TILT = (32 * Math.PI) / 180;
// The moon's path leans a little further south, so it doesn't pass over the sun.
const MOON_TILT = (40 * Math.PI) / 180;

const at = (name) => {
  let start = 0;
  for (const [phase, minutes] of PHASES) {
    if (phase === name) return { start, minutes };
    start += minutes;
  }
};
const DAWN = at("dawn");
const DUSK = at("dusk");
const SUNRISE = DAWN.start + DAWN.minutes / 2;
const SUNSET = DUSK.start + DUSK.minutes / 2;

export function cyclesAt(ms) {
  return (ms - EPOCH_MS) / CYCLE_MS;
}

// The phase at a time of day (0-1), and how far through it (0-1).
export function phaseAt(cycles) {
  let minute = frac(cycles) * CYCLE_MINUTES;
  for (const [name, minutes] of PHASES) {
    if (minute < minutes) return { name, through: minute / minutes };
    minute -= minutes;
  }
  return { name: PHASES[0][0], through: 0 };
}

// How dark it is for stealth: 0 by day, 1 at night, ramping through dusk and dawn.
export function darkness(cycles) {
  const { name, through } = phaseAt(cycles);
  return { day: 0, dusk: through, night: 1, dawn: 1 - through }[name];
}

// The sun's angle round its path: 0 rising in the east, half a turn setting in the west. Day is
// longer than night, so it crosses the sky slower than it passes under it.
export function sunAngle(cycles) {
  const minute = frac(cycles) * CYCLE_MINUTES;
  const up = SUNSET - SUNRISE;
  const since = (minute - SUNRISE + CYCLE_MINUTES) % CYCLE_MINUTES;
  return since < up ? (Math.PI * since) / up : Math.PI + (Math.PI * (since - up)) / (CYCLE_MINUTES - up);
}

// The moon's age through its month: 0 new, 0.5 full.
export function moonAge(cycles) {
  return frac(cycles / LUNAR_DAYS);
}

// Unit vector toward a body at `angle` round a path leaning `tilt` south (x east, y up, z south).
export function pathDir(angle, tilt) {
  return [Math.cos(angle), Math.sin(angle) * Math.cos(tilt), Math.sin(angle) * Math.sin(tilt)];
}

// Everything the sky needs at a moment.
export function skyAt(cycles) {
  const sun = sunAngle(cycles);
  const age = moonAge(cycles);
  return {
    phase: phaseAt(cycles).name,
    darkness: darkness(cycles),
    sunDir: pathDir(sun, PATH_TILT),
    moonDir: pathDir(sun - 2 * Math.PI * age, MOON_TILT),
    moonAge: age,
    // How far the sky has turned, for wheeling the stars.
    turn: frac(cycles) * 2 * Math.PI,
  };
}

function frac(v) {
  return v - Math.floor(v);
}
