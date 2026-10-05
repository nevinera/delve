// Stealthed units arrive without a position (everyone is sent the same
// state); each message's stealth_view says which of them this player
// detects, where they are, and how well they see them - "full" or "faint"
// (see docs/schema/unit_type.md's Stealth). visibleUnits merges the two into
// what this player can see: detected stealthed units get their position and
// a stealth_visibility, and undetected ones are left out entirely, so they're
// neither drawn nor targetable. The checksum is computed over the shared
// units, not this.
export function visibleUnits(units, stealthView) {
  let out = null;
  for (const [id, unit] of Object.entries(units)) {
    if (unit.position != null) continue;
    out ??= {...units};
    const seen = stealthView?.[id];
    if (seen) out[id] = {...unit, position: seen.position, stealth_visibility: seen.visibility};
    else delete out[id];
  }
  return out ?? units;
}
