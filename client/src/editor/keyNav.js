// Held-key navigation: W A S D pan, C zooms in and V out, Q and E turn. While any of those keys is
// down, onStep(dt, { x, z, zoom, turn }) runs every frame, each axis -1, 0 or 1 and dt in seconds.
// Keys typed into fields, or pressed with ctrl, cmd or alt, are left alone.

const KEYS = {
  w: ["z", -1],
  s: ["z", 1],
  a: ["x", -1],
  d: ["x", 1],
  c: ["zoom", 1],
  v: ["zoom", -1],
  q: ["turn", 1],
  e: ["turn", -1],
};

export function keyNav(onStep) {
  const held = new Set();
  let last = null;

  const frame = (now) => {
    if (!held.size) {
      last = null;
      return;
    }
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    const move = { x: 0, z: 0, zoom: 0, turn: 0 };
    for (const key of held) move[KEYS[key][0]] += KEYS[key][1];
    if (dt > 0) onStep(dt, move);
    requestAnimationFrame(frame);
  };

  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (!KEYS[key] || e.ctrlKey || e.metaKey || e.altKey || e.target.matches("input, textarea, select")) return;
    e.preventDefault();
    if (!held.size) requestAnimationFrame(frame);
    held.add(key);
  });
  window.addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => held.clear());
}
