// Timing a page reads for itself: the steps of its startup, how long each part of a frame takes,
// and logging you turn on by topic with `?debug=` (topics joined by commas, or "all"), such as
// `?debug=ground,perf`, or for every page in this browser with `localStorage.debug = "perf"`. Startup steps also go on the browser's performance timeline, so they
// show in its developer tools' performance panel.

function topicsIn(search, saved = "") {
  const asked = `${new URLSearchParams(search).get("debug") ?? ""},${saved}`;
  return new Set(
    asked
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean),
  );
}

// The topics in the page's address, and those kept in this browser, as with
// `localStorage.debug = "perf"` in the console.
function savedTopics() {
  try {
    return globalThis.localStorage?.getItem("debug") ?? "";
  } catch {
    return "";
  }
}

let topics = topicsIn(globalThis.location?.search ?? "", savedTopics());

// Whether `?debug=` or the saved setting asked for the topic.
export const debugging = (topic) => topics.has(topic) || topics.has("all");

// For tests: the topics as a page's query string and the saved setting ask for them.
export function setDebugTopics(search, saved = "") {
  topics = topicsIn(search, saved);
}

// Logs to the console under the topic, when it's turned on.
export function debugLog(topic, ...args) {
  if (debugging(topic)) console.log(`[${topic}]`, ...args);
}

// The steps of a page's startup, each timed from the step before, and the first from when the
// page was asked for.
export class Startup {
  constructor(name, { now = () => performance.now(), timeline = globalThis.performance } = {}) {
    this.name = name;
    this.now = now;
    this.timeline = timeline;
    this.steps = []; // { name, ms, at }, in the order they happened
    this.last = 0;
  }

  step(name) {
    const at = this.now();
    const ms = at - this.last;
    this.steps.push({ name, ms, at });
    try {
      this.timeline?.measure?.(`${this.name}: ${name}`, { start: this.last, end: at });
    } catch {}
    this.last = at;
    debugLog("perf", `${this.name} ${name}: ${Math.round(ms)} ms, at ${Math.round(at)} ms`);
    return this.steps.at(-1);
  }

  // A step once only, the first time it's reached.
  once(name) {
    if (!this.steps.some((s) => s.name === name)) this.step(name);
  }
}

// How long each part of a frame takes, kept until taken: the mean a frame and the slowest, in ms,
// with the frames counted and the longest gap between them.
export class FrameParts {
  constructor({ now = () => performance.now() } = {}) {
    this.now = now;
    this.reset();
  }

  reset() {
    this.parts = new Map(); // name -> { total, worst }, in the order first timed
    this.frames = 0;
    this.gap = 0;
  }

  // Runs fn, adding how long it took to the part's time this frame.
  time(part, fn) {
    const start = this.now();
    try {
      return fn();
    } finally {
      this.add(part, this.now() - start);
    }
  }

  add(part, ms) {
    const kept = this.parts.get(part) ?? { total: 0, worst: 0, frame: 0 };
    kept.total += ms;
    kept.frame += ms;
    this.parts.set(part, kept);
  }

  // Ends a frame, `gap` ms after the one before, and gives each part's time in it: all its runs
  // that frame added up, which is what a part's slowest is a slowest of.
  frame(gap = 0) {
    this.frames++;
    this.gap = Math.max(this.gap, gap);
    const times = {};
    for (const [name, kept] of this.parts) {
      times[name] = kept.frame;
      kept.worst = Math.max(kept.worst, kept.frame);
      kept.frame = 0;
    }
    return times;
  }

  // The parts' times since they were last taken, and starts again.
  take() {
    const frames = Math.max(1, this.frames);
    const parts = [...this.parts].map(([name, { total, worst }]) => ({ name, mean: total / frames, worst }));
    const taken = { frames: this.frames, gap: this.gap, parts };
    this.reset();
    return taken;
  }
}
