// Log lines for the loot claims of ours the server reports as failed (a
// delta's loot_failures). claimed_by is a unit ID - the key a unit is
// stored under in the units map, not a field on the unit itself.
export function lootFailureMessages(lootFailures, selfUnitId) {
  if (!selfUnitId) return [];
  return lootFailures
    .filter((failure) => failure.claimed_by === selfUnitId)
    .map((failure) =>
      failure.reason === "not_persisted"
        ? `Can't keep ${failure.item.name}: loot isn't kept when trying a zone directly.`
        : `Failed to loot ${failure.item.name} - please try again.`
    );
}
