// Builds a name-keyed lookup of every Status a set of powers can apply, for
// resolving a unit's active_status_effects (which only carry the status's
// name over the wire, not its full definition - see game-server/internal/
// instance/messages.go's effectJSON) back to something with an auraEffect to
// display. baseUrl travels with each entry since it's needed later to
// resolve a relative auraEffect.sourceURL, and different power sources (the
// player's own class vs. a zone unit type) resolve against different URLs.
export function buildStatusCatalog(powers, baseUrl) {
  const catalog = {};
  for (const power of powers ?? []) {
    for (const effect of power.effects ?? []) {
      if (effect.type !== "status" || !effect.status?.name) continue;
      catalog[effect.status.name] = { status: effect.status, baseUrl };
    }
  }
  return catalog;
}

// Merges any number of catalogs (see buildStatusCatalog), later ones winning
// on a name collision - not expected in practice (status names are meant to
// be unique across content), just a defined tiebreak rather than undefined
// behavior.
export function mergeStatusCatalogs(...catalogs) {
  return Object.assign({}, ...catalogs);
}
