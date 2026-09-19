// Asks Build::DpsSimsController for the unit type's estimated damage against
// each mocked gearing plan x relative elevation (see issue #72). Takes the
// *resolved* unit type (see resolveFullUnitType.js) - same reasoning as
// validateUnitType. Resolves to the {results: [...]} matrix, or throws an
// Error carrying the server's message.
function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content;
}

export async function estimateDamage(fullUnitType) {
  const res = await fetch("/build/dps_sims/unit_type", {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-CSRF-Token": csrfToken()},
    body: JSON.stringify(fullUnitType),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Estimate failed (${res.status})`);
  return body;
}
