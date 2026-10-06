// Mirrors ProvenanceRestrictions#allows? (app/services/provenance_restrictions.rb):
// restrictions is {world_key, layers}; an item must pass every layer, and
// trainee gear (no world_key) always passes.
export function itemAllowed(item, restrictions) {
  if (!item?.world_key || !restrictions) return true;
  return (restrictions.layers || []).every(layer => {
    if (layer.maxElevation != null && item.elvl > layer.maxElevation) return false;
    if (layer.worlds == null) return true;
    return item.world_key === restrictions.world_key || layer.worlds.includes(item.world_key);
  });
}

export function disallowedItems(equippedItems, restrictions) {
  return Object.values(equippedItems || {}).filter(item => !itemAllowed(item, restrictions));
}
