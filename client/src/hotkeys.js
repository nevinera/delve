// Keyboard bindings, as the {action: binding} object stored per character
// (CharacterSetting#custom_hotkeys). The effective bindings are
// DEFAULT_HOTKEYS with the character's saved ones merged on top; a saved
// null unbinds an action.
//
// A binding is one key, optionally prefixed with "s+" for shift: "w", "5",
// "tab", "s+t". Keys are physical (KeyboardEvent#code), not the character the
// layout produces, so WASD stays a cluster on any layout and shift never
// turns "2" into "@". Ctrl/alt/meta are not supported: browsers and OSes
// claim too many of those combinations.
//
// Escape is deliberately not an action: it is the fixed way out of menus.
export const ACTIONS = [
  { id: "move_forward", label: "Move forward" },
  { id: "move_backward", label: "Move backward" },
  { id: "strafe_left", label: "Strafe left" },
  { id: "strafe_right", label: "Strafe right" },
  { id: "turn_left", label: "Turn left" },
  { id: "turn_right", label: "Turn right" },
  ...Array.from({ length: 10 }, (_, i) => ({ id: `ability_${i + 1}`, label: `Ability button ${i + 1}` })),
  { id: "target_next", label: "Target next enemy" },
  { id: "attack_start", label: "Start attacking" },
  { id: "attack_stop", label: "Stop attacking" },
  { id: "toggle_character_sheet", label: "Character sheet" },
  { id: "toggle_latency", label: "Toggle latency display" },
];

export const DEFAULT_HOTKEYS = {
  move_forward: "w",
  move_backward: "s",
  strafe_left: "q",
  strafe_right: "e",
  turn_left: "a",
  turn_right: "d",
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`ability_${i + 1}`, String((i + 1) % 10)])),
  target_next: "tab",
  attack_start: "t",
  attack_stop: "s+t",
  toggle_character_sheet: "p",
  toggle_latency: "l",
};

// The vocabulary the movement/turn refs and the joystick already use.
export const MOVEMENT_ACTIONS = {
  move_forward: "forward",
  move_backward: "backward",
  strafe_left: "strafe_left",
  strafe_right: "strafe_right",
};
export const TURN_ACTIONS = { turn_left: "turn_left", turn_right: "turn_right" };

const NAMED_KEYS = {
  Tab: "tab", Space: "space", Enter: "enter", Backspace: "backspace",
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
  Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
};
const RESERVED = new Set(["Escape"]);
const MODIFIER_CODES = /^(Shift|Control|Alt|Meta|OS)(Left|Right)$/;

// The key part of a binding for a KeyboardEvent#code, or null if that key
// can't be bound (modifiers alone, Escape, keys we don't name).
export function keyToken(code) {
  if (RESERVED.has(code) || MODIFIER_CODES.test(code)) return null;
  const letter = code.match(/^Key([A-Z])$/)?.[1];
  if (letter) return letter.toLowerCase();
  const digit = code.match(/^(?:Digit|Numpad)(\d)$/)?.[1];
  if (digit) return digit;
  if (/^F\d{1,2}$/.test(code)) return code.toLowerCase();
  return NAMED_KEYS[code] ?? null;
}

// The binding string a keypress would create (used when capturing a new
// binding), or null if the key can't be bound.
export function bindingFromEvent(e) {
  const token = keyToken(e.code);
  if (!token) return null;
  return e.shiftKey ? `s+${token}` : token;
}

export function resolveHotkeys(custom) {
  const hotkeys = { ...DEFAULT_HOTKEYS };
  for (const { id } of ACTIONS) {
    if (custom && id in custom) hotkeys[id] = custom[id];
  }
  return hotkeys;
}

// binding -> action, for dispatching keypresses. If two actions share a
// binding the earlier one in ACTIONS wins (saving is meant to prevent that).
export function buildBindingIndex(hotkeys) {
  const index = new Map();
  for (const { id } of ACTIONS) {
    const binding = hotkeys[id];
    if (binding && !index.has(binding)) index.set(binding, id);
  }
  return index;
}

// The action a keypress triggers. An exact "s+key" binding wins, otherwise
// the plain "key" binding applies even with shift held (so shift+W still
// walks forward and shift+1 still presses button 1).
export function actionForEvent(index, e) {
  const token = keyToken(e.code);
  if (!token) return null;
  if (e.shiftKey) {
    const exact = index.get(`s+${token}`);
    if (exact) return exact;
  }
  return index.get(token) ?? null;
}

// Key-up ignores shift state entirely: releasing shift first must still
// release the movement key.
export function actionForKeyUp(index, e) {
  const token = keyToken(e.code);
  if (!token) return null;
  return index.get(token) ?? index.get(`s+${token}`) ?? null;
}

// How a binding reads on a button or in the menu.
export function bindingLabel(binding) {
  if (!binding) return "";
  const shift = binding.startsWith("s+");
  const key = shift ? binding.slice(2) : binding;
  return `${shift ? "Shift+" : ""}${key.length === 1 ? key.toUpperCase() : key}`;
}
