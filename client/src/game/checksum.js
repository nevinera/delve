function canonicalEffects(unit) {
  return (unit.active_status_effects ?? [])
    .map((e) => ({ id: e.status_identifier, expiresAt: e.expires_at }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function canonicalUnit(unit) {
  const pos = unit.position;
  return {
    id: unit.zone_unit_identifier,
    map: unit.map_identifier,
    x: pos.x,
    y: pos.y,
    angle: pos.angle,
    health: unit.health,
    maxHealth: unit.max_health,
    resource: unit.resource,
    maxResource: unit.max_resource,
    status: unit.status,
    effects: canonicalEffects(unit),
  };
}

export async function computeChecksum(unitsById) {
  const sorted = Object.values(unitsById)
    .map(canonicalUnit)
    .sort((a, b) => a.id.localeCompare(b.id));
  const json = JSON.stringify(sorted);
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(json)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
