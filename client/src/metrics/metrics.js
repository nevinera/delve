// Measurements for the metrics database (app/models/metric.rb). A page records timings (in
// milliseconds), counts and gauges; they're sent in batches every few seconds and when the page
// goes away. Names are lowercase words joined by dots, such as "play.load.platters".
/* global __BUILD__ */

const EVERY_MS = 10_000;
const MOST_HELD = 500; // past this, new measurements are dropped until a send

export function createMetrics({ send, now = () => performance.now(), tags = {} } = {}) {
  let held = [];

  function add(kind, name, value, more) {
    if (held.length >= MOST_HELD || !Number.isFinite(value)) return;
    held.push({ name, kind, value, tags: more, measuredAt: now() });
  }

  return {
    timing: (name, ms, more) => add("timing", name, ms, more),
    count: (name, n = 1, more) => add("count", name, n, more),
    gauge: (name, value, more) => add("gauge", name, value, more),
    // Starts a timer; calling what it returns records how long it's been.
    time(name, more) {
      const start = now();
      return (also) => add("timing", name, now() - start, { ...more, ...also });
    },
    flush() {
      if (held.length === 0) return;
      const at = now();
      const metrics = held.map(({ measuredAt, ...m }) => ({ ...m, at: Math.round(at - measuredAt) }));
      held = [];
      send({ metrics, tags });
    },
    get held() {
      return held.length;
    },
  };
}

function post(body) {
  const token = document.querySelector("meta[name=csrf-token]")?.content;
  fetch("/metrics", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token ?? "" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

function pageTags() {
  return {
    page: location.pathname.split("/")[1] || "home",
    build: typeof __BUILD__ === "string" ? __BUILD__ : "",
    device: matchMedia?.("(pointer: coarse)").matches ? "phone" : "desktop",
  };
}

let shared;

// The page's metrics, sent to the server. Pages share one, so call this wherever you measure.
export function metrics() {
  if (shared) return shared;
  shared = createMetrics({ send: post, tags: pageTags() });
  setInterval(() => shared.flush(), EVERY_MS);
  addEventListener("pagehide", () => shared.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") shared.flush();
  });
  return shared;
}
