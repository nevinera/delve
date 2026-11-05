import { createRecorder, errorIn } from "./recorder.js";

// Starts recording this page's errors. It wraps the console, so it's imported first.

/* global __BUILD__ */
const build = typeof __BUILD__ === "string" ? __BUILD__ : "";
let graphics = null;

// Which graphics card draws the page, worked out once, from a context made and dropped for it.
function graphicsCard() {
  if (graphics !== null) return graphics;
  graphics = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    graphics = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : (gl?.getParameter(gl.RENDERER) ?? "no WebGL");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    graphics = "unknown";
  }
  return graphics;
}

function about() {
  const memory = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 2 ** 20) : null;
  return {
    browser: navigator.userAgent,
    screen: `${innerWidth}x${innerHeight} at ${devicePixelRatio}x`,
    graphics: graphicsCard(),
    ...(memory ? { memoryMb: memory } : {}),
    hidden: document.hidden,
  };
}

function send(report) {
  const token = document.querySelector("meta[name=csrf-token]")?.content;
  fetch("/client_errors", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token ?? "" },
    body: JSON.stringify({ error: report }),
  }).catch(() => {});
}

if (typeof window !== "undefined" && !window.__errorRecorder) {
  const recorder = createRecorder({ send, about, build });
  window.__errorRecorder = recorder;
  for (const kind of ["log", "info", "warn", "error"]) {
    const original = console[kind].bind(console);
    console[kind] = (...args) => {
      recorder.note(kind, args);
      if (kind === "error") {
        const error = errorIn(args);
        recorder.report(args.map((value) => (value instanceof Error ? value.message : String(value))).join(" ").slice(0, 1000), error?.stack ?? new Error().stack);
      }
      original(...args);
    };
  }
  window.addEventListener(
    "error",
    (event) => {
      // A script, image or sound that didn't load comes here too, on its element, without bubbling.
      if (event.target && event.target !== window) {
        const src = event.target.src ?? event.target.href ?? event.target.tagName;
        recorder.report(`couldn't load ${src}`);
        return;
      }
      recorder.report(event.message || "error", event.error?.stack ?? `at ${event.filename}:${event.lineno}:${event.colno}`);
    },
    true,
  );
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    recorder.report(`unhandled: ${reason instanceof Error ? reason.message : String(reason)}`, reason?.stack ?? "");
  });
  // Losing the graphics card's memory makes no error, but it's why a scene goes missing.
  window.addEventListener("webglcontextlost", () => recorder.report("WebGL context lost"), true);
  window.addEventListener("webglcontextrestored", () => recorder.note("event", ["WebGL context restored"]), true);
}
