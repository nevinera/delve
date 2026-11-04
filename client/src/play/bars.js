// Your action bars: which ability sits in each slot, by id, "" for none. Nothing here touches the page.

export const BAR_COUNT = 3;
export const BAR_SLOTS = 12;
export const SLOT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
const SLOT_CODES = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"];
const MODIFIERS = ["", "shift ", "alt "];

const empty = () => Array.from({ length: BAR_COUNT }, () => Array(BAR_SLOTS).fill(""));
const copy = (bars) => bars.map((bar) => [...bar]);

// What you start with: what you know, in order, filling each bar.
export function defaultBars(known) {
  const bars = empty();
  known.slice(0, BAR_COUNT * BAR_SLOTS).forEach((ability, i) => (bars[Math.floor(i / BAR_SLOTS)][i % BAR_SLOTS] = ability.id));
  return bars;
}

// The bars to show: those you've set, in full, or else the default.
export function barsFor(saved, known) {
  if (!Array.isArray(saved)) return defaultBars(known);
  const bars = empty();
  saved.slice(0, BAR_COUNT).forEach((bar, b) => (bar ?? []).slice(0, BAR_SLOTS).forEach((id, s) => (bars[b][s] = typeof id === "string" ? id : "")));
  return bars;
}

export function placed(bars, { bar, slot }, id) {
  const out = copy(bars);
  out[bar][slot] = id;
  return out;
}

// Swaps what's in two slots, so moving onto an empty one leaves the first empty.
export function swapped(bars, a, b) {
  const out = copy(bars);
  [out[a.bar][a.slot], out[b.bar][b.slot]] = [out[b.bar][b.slot], out[a.bar][a.slot]];
  return out;
}

export const cleared = (bars, at) => placed(bars, at, "");

// The slot a key means: plain for the first bar, shift for the second and alt for the third.
export function slotForKey({ code, shiftKey, altKey }) {
  const slot = SLOT_CODES.indexOf(code);
  return slot < 0 ? null : { bar: altKey ? 2 : shiftKey ? 1 : 0, slot };
}

export const keyLabel = (bar, slot) => `${MODIFIERS[bar]}${SLOT_KEYS[slot]}`;
