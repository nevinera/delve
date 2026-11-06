// The key settings page in play's menu: each action with its key. Click one and press a new key to
// bind it; a key another action had moves, and the page says which. Escape stops waiting.

import { ACTIONS, comboOf } from "./keys.js";

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

export function keysPanel(root, keys) {
  const note = el("p", { className: "play-keys-note" });
  let waiting = null; // { id, button }

  const stopWaiting = () => {
    window.removeEventListener("keydown", heard, { capture: true });
    keys.recording = false;
    waiting = null;
  };

  function heard(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape") {
      stopWaiting();
      note.textContent = "";
      draw();
      return;
    }
    const combo = comboOf(e);
    if (!combo) return; // a modifier on its own: wait for the key with it
    const { id } = waiting;
    stopWaiting();
    const { moved, refused } = keys.bind(id, combo);
    note.textContent = refused ? "That key can't be bound." : moved ? `${keys.label(id)} was ${moved.group}: ${moved.label}, which now has no key.` : "";
  }

  function draw() {
    const rows = [];
    let group = null;
    for (const action of ACTIONS) {
      if (action.group !== group) {
        group = action.group;
        rows.push(el("h3", { textContent: group }));
      }
      const button = el("button", { type: "button", className: "play-key", textContent: keys.label(action.id) || "none" });
      button.addEventListener("click", () => {
        if (waiting) stopWaiting();
        draw();
        const fresh = root.querySelector(`[data-action="${action.id}"] .play-key`);
        fresh.textContent = "press a key";
        fresh.classList.add("is-waiting");
        waiting = { id: action.id, button: fresh };
        keys.recording = true;
        window.addEventListener("keydown", heard, { capture: true });
      });
      const row = el("div", { className: "play-key-row" }, el("span", { textContent: action.label }), button);
      row.dataset.action = action.id;
      rows.push(row);
    }
    const reset = el("button", { type: "button", className: "play-keys-reset", textContent: "reset to the defaults" });
    reset.addEventListener("click", () => {
      if (waiting) stopWaiting();
      keys.reset();
      note.textContent = "Every key is back to its default.";
    });
    root.replaceChildren(el("p", { className: "play-keys-hint", textContent: "Click a key, then press the new one. Escape always closes things, and can't be bound." }), note, reset, ...rows);
  }

  keys.onChange(draw);
  // Leaving the page stops waiting for a key.
  root.closest(".play-menu")?.addEventListener("toggle", (e) => e.newState === "closed" && waiting && (stopWaiting(), draw()));
  draw();
  return { stop: () => waiting && (stopWaiting(), draw()) };
}
