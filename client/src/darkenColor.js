// A resource bar's "used" (already-spent) portion is shown as a darkened
// version of the resource's own color, rather than a fixed dark track -
// so energy/mana/rage-ish resources still read as visually distinct from
// each other and from the health bar's fixed dark red. hex is a bare
// 6-digit hex string (no leading "#"), matching ResourceType.color (see
// docs/schema/resource_type.md); anything else falls back to a neutral
// dark gray so a missing/malformed color never breaks rendering.
export function darkenHexColor(hex, factor = 0.35) {
  const clean = (hex ?? "").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return "#333333";
  const n = parseInt(clean, 16);
  const channel = (shift) => Math.round(((n >> shift) & 255) * factor);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}
