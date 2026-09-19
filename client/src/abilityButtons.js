// Ability button layout: which power sits on which of the action bar's
// buttons. Stored per character as CharacterSetting#ability_button_map, a
// {button: powerIndex} object (JSON, so keys are strings). Hotkeys belong to
// the button position, not the power, so remapping never changes which key
// fires which button.
export const ABILITY_BUTTON_COUNT = 10;

const identity = (count) => Array.from({ length: count }, (_, i) => i);

// Turns the stored map into a full layout: layout[button] === powerIndex. Any
// malformed, out-of-range or non-permutation map falls back to identity
// (button i shows power i), so bad data can't hide or duplicate a power.
export function resolveButtonLayout(map, count = ABILITY_BUTTON_COUNT) {
  const layout = identity(count);
  for (const [button, power] of Object.entries(map ?? {})) {
    const b = Number(button);
    if (!Number.isInteger(b) || b < 0 || b >= count) return identity(count);
    if (!Number.isInteger(power) || power < 0 || power >= count) return identity(count);
    layout[b] = power;
  }
  return new Set(layout).size === count ? layout : identity(count);
}

// Puts `power` on `button`, moving whatever was on that button to the spot
// `power` came from, so the layout stays a permutation.
export function assignPowerToButton(layout, button, power) {
  const next = [...layout];
  const from = next.indexOf(power);
  if (from === -1 || from === button) return next;
  next[from] = next[button];
  next[button] = power;
  return next;
}

export function layoutToMap(layout) {
  return Object.fromEntries(layout.map((power, button) => [String(button), power]));
}

function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content;
}

// PATCHes part of the character's settings (camelCase-free: the Rails param
// names). Resolves to the server's saved settings, or throws an Error.
export async function saveCharacterSettings(url, setting) {
  const token = csrfToken();
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { "X-CSRF-Token": token } : {}),
    },
    credentials: "same-origin",
    body: JSON.stringify({ setting }),
  });
  if (!res.ok) throw new Error(`Failed to save settings (${res.status})`);
  return res.json();
}
