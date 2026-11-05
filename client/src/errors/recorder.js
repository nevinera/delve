// Keeps this page's recent console lines and events, and reports errors to the server
// (ClientErrorsController) with them. Each page's entry imports install.js before anything else.

export const KEEP_LINES = 100;
const LINE_CHARS = 300;
export const MOST_REPORTS = 30; // a page load sends no more than this
export const QUIET_MS = 30_000; // the same message isn't sent again for this long

// What a console argument reads as in a line.
function asText(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// send(report): sends it. about(): what's known about the browser, added to each report.
export function createRecorder({ send, about = () => ({}), now = () => performance.now(), page = () => location.pathname, build = "" }) {
  const lines = [];
  const lastSent = new Map(); // message -> when
  let sent = 0;
  let busy = false;

  function note(kind, args) {
    const text = args.map(asText).join(" ").slice(0, LINE_CHARS);
    lines.push(`${(now() / 1000).toFixed(1)}s ${kind} ${text}`);
    if (lines.length > KEEP_LINES) lines.shift();
  }

  function report(message, stack = "", extra = {}) {
    if (busy || sent >= MOST_REPORTS) return false;
    const at = now();
    if (at - (lastSent.get(message) ?? -Infinity) < QUIET_MS) return false;
    lastSent.set(message, at);
    sent++;
    busy = true;
    try {
      send({ message, stack, page: page(), build, details: { ...about(), ...extra, seconds: Math.round(at / 1000), lines: [...lines] } });
    } catch {
      // A report that can't be sent isn't worth another.
    } finally {
      busy = false;
    }
    return true;
  }

  return { note, report, lines };
}

// The first error among a console call's arguments, or one made here for its stack.
export function errorIn(args) {
  return args.find((value) => value instanceof Error) ?? null;
}
