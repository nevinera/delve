// A continent's map pins: places marked on the map in play, set with /create's map tool. Kept in
//
//   places/continents/<c>/map.json   { "version": 1, "pins": [{ "id", "name", "type", "at": [x, z] }] }
//
// `id` is the pin's own, for other files to point at; `type` picks its icon.

export const PIN_TYPES = ["place", "cave"];
export const PIN_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const PIN_NAME_MAX = 64;

export const mapPinsPath = (continent) => `places/continents/${continent}/map.json`;

// What's wrong with `pin` among `others` (the rest of the continent's), or "".
export function pinTrouble({ id, name, type }, others = []) {
  if (!PIN_ID.test(id ?? "")) return "An id is 1 to 32 lowercase letters, digits and dashes, starting with a letter or digit.";
  if (others.some((pin) => pin.id === id)) return `There's a pin called ${id} already.`;
  if (!name?.trim()) return "It needs a name.";
  if (name.length > PIN_NAME_MAX) return `A name is ${PIN_NAME_MAX} characters at most.`;
  if (!PIN_TYPES.includes(type)) return `A type is ${PIN_TYPES.join(" or ")}.`;
  return "";
}

// The pins in a map.json, as read, leaving out any that aren't whole.
export function readMapPins(json) {
  const pins = [];
  for (const pin of Array.isArray(json?.pins) ? json.pins : []) {
    if (!Array.isArray(pin?.at) || pin.at.length !== 2 || !pin.at.every(Number.isFinite) || pinTrouble(pin, pins)) continue;
    pins.push({ id: pin.id, name: pin.name, type: pin.type, at: [pin.at[0], pin.at[1]] });
  }
  return pins;
}

// The continent's pins as /create edits them.
export class MapPins {
  constructor() {
    this.pins = [];
    this.version = 0;
  }

  // What the file has, as saved: it doesn't count as a change.
  load(json) {
    this.pins = readMapPins(json);
  }

  toJSON() {
    return { version: 1, pins: this.pins.map(({ id, name, type, at }) => ({ id, name, type, at: at.map((v) => Math.round(v * 10) / 10) })) };
  }

  // Puts `pin` in, in place of `old` where it's given. Gives what's wrong with it instead, or "".
  set(pin, old = null) {
    const trouble = pinTrouble(pin, this.pins.filter((other) => other !== old));
    if (trouble) return trouble;
    const k = this.pins.indexOf(old);
    if (k >= 0) this.pins[k] = pin;
    else this.pins.push(pin);
    this.version++;
    return "";
  }

  remove(pin) {
    this.pins = this.pins.filter((other) => other !== pin);
    this.version++;
  }
}
