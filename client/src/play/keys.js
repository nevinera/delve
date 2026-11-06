// The keys for play's actions, which you can change, kept in this browser. A key is a combo: the
// modifiers held, then the key's code, as "Shift+Digit1". Codes name a key by where it sits, so a
// binding stays put whatever the keyboard's layout. Escape is never bound: it's always the way out.

import { BAR_COUNT, BAR_SLOTS } from "./bars.js";

const KEPT = "playKeys"; // the bindings you've changed, in localStorage
const MODIFIERS = ["Ctrl", "Alt", "Shift", "Meta"];
const SLOT_CODES = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"];
const BAR_MODIFIERS = ["", "Shift+", "Alt+"];

// Every action, in the order the key settings list them. `holds` is the walker's name for a key
// held down to move; `toggles` its name for one that switches something.
export const ACTIONS = [
  { id: "forward", label: "Move forward", group: "Moving", key: "KeyW", holds: "w" },
  { id: "back", label: "Move back", group: "Moving", key: "KeyS", holds: "s" },
  { id: "turnLeft", label: "Turn left", group: "Moving", key: "KeyA", holds: "a" },
  { id: "turnRight", label: "Turn right", group: "Moving", key: "KeyD", holds: "d" },
  { id: "strafeLeft", label: "Step left", group: "Moving", key: "KeyQ", holds: "q" },
  { id: "strafeRight", label: "Step right", group: "Moving", key: "KeyE", holds: "e" },
  { id: "jump", label: "Jump", group: "Moving", key: "Space", holds: " " },
  { id: "walkRun", label: "Walk or run", group: "Moving", key: "KeyZ", toggles: "z" },
  { id: "sit", label: "Sit or stand", group: "Moving", key: "KeyX", toggles: "x" },
  { id: "target", label: "Next target", group: "Fighting", key: "Tab" },
  { id: "spellbook", label: "Spellbook", group: "Fighting", key: "KeyP" },
  { id: "chat", label: "Open chat", group: "Chat", key: "Enter" },
  { id: "command", label: "Type a command", group: "Chat", key: "Slash" },
  ...Array.from({ length: BAR_COUNT * BAR_SLOTS }, (_, i) => {
    const [bar, slot] = [Math.floor(i / BAR_SLOTS), i % BAR_SLOTS];
    return { id: slotAction(bar, slot), label: `Slot ${slot + 1}`, group: `Action bar ${bar + 1}`, key: `${BAR_MODIFIERS[bar]}${SLOT_CODES[slot]}`, slot: { bar, slot } };
  }),
];
const BY_ID = new Map(ACTIONS.map((action) => [action.id, action]));

export function slotAction(bar, slot) {
  return `bar${bar + 1}.${slot + 1}`;
}

const isModifier = (code) => /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/.test(code);

// The combo a key event is, or null for a modifier on its own, Escape, or an event with no code.
export function comboOf({ code, ctrlKey, altKey, shiftKey, metaKey }) {
  if (!code || code === "Escape" || isModifier(code)) return null;
  const held = [ctrlKey, altKey, shiftKey, metaKey];
  return [...MODIFIERS.filter((_, i) => held[i]), code].join("+");
}

const NAMES = { Space: "Space", Minus: "-", Equal: "=", Slash: "/", Backslash: "\\", Backquote: "`", BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };

// A combo as people read it: "Shift 1", "W", "Space". "" for none.
export function labelOf(combo) {
  if (!combo) return "";
  const parts = combo.split("+");
  const code = parts.pop();
  const name = NAMES[code] ?? code.replace(/^(Key|Digit|Numpad)/, (m) => (m === "Numpad" ? "Num " : ""));
  return [...parts, name].join(" ");
}

// Your bindings: the defaults, with what you've changed over them. `storage` is localStorage, or
// anything with getItem and setItem.
export class KeyBindings {
  constructor(storage = null) {
    this.storage = storage;
    this.changes = {};
    try {
      const kept = JSON.parse(storage?.getItem(KEPT) ?? "{}");
      for (const [id, combo] of Object.entries(kept ?? {})) if (BY_ID.has(id) && typeof combo === "string") this.changes[id] = combo;
    } catch {}
    this.heard = new Set();
    this.recording = false; // while the key settings wait for a new key, nothing else acts on keys
    this.index();
  }

  index() {
    this.byCombo = new Map();
    for (const action of ACTIONS) {
      const combo = this.keyOf(action.id);
      if (combo && !this.byCombo.has(combo)) this.byCombo.set(combo, action);
    }
  }

  keyOf(id) {
    return Object.hasOwn(this.changes, id) ? this.changes[id] : (BY_ID.get(id)?.key ?? "");
  }

  label(id) {
    return labelOf(this.keyOf(id));
  }

  // The action a key event asks for, or null.
  actionFor(event) {
    const combo = comboOf(event);
    return combo ? (this.byCombo.get(combo) ?? null) : null;
  }

  // The moving actions bound to a key's code with no modifiers, so a held key moves you whatever
  // else you're holding, and letting go of it stops you.
  heldFor(code) {
    return ACTIONS.filter((action) => action.holds && this.keyOf(action.id) === code);
  }

  // The moving actions a key's code lets go of, whatever modifiers they were bound with.
  releasedBy(code) {
    return ACTIONS.filter((action) => action.holds && this.keyOf(action.id).split("+").pop() === code);
  }

  // Binds an action to a combo. A combo another action had is moved, leaving that one unbound,
  // and it's given back so you can be told. Escape can't be bound.
  bind(id, combo) {
    if (!BY_ID.has(id) || !combo || combo.split("+").pop() === "Escape") return { refused: true };
    const other = ACTIONS.find((action) => action.id !== id && this.keyOf(action.id) === combo);
    if (other) this.set(other.id, "");
    this.set(id, combo);
    this.save();
    return { moved: other ?? null };
  }

  set(id, combo) {
    if (combo === BY_ID.get(id).key) delete this.changes[id];
    else this.changes[id] = combo;
  }

  reset() {
    this.changes = {};
    this.save();
  }

  save() {
    this.index();
    try {
      this.storage?.setItem(KEPT, JSON.stringify(this.changes));
    } catch {}
    for (const hear of this.heard) hear();
  }

  // hear() whenever a binding changes. Gives back a function that stops it.
  onChange(hear) {
    this.heard.add(hear);
    return () => this.heard.delete(hear);
  }
}

let shared = null;

// The page's bindings, kept in this browser's localStorage.
export function keyBindings() {
  if (!shared) {
    let storage = null;
    try {
      storage = globalThis.localStorage ?? null;
    } catch {}
    shared = new KeyBindings(storage);
  }
  return shared;
}
