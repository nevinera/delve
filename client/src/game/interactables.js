// Quest interactables (docs/schema/map.md#interactable): how each is drawn
// for this player, and whether they're close enough to use it. Pure; the
// scene draws them and App sends use_interactable.

// How far from an interactable's middle a player can use it, past their own
// radius (the game server's UseRange): talk range plus room for a big one.
export const USE_RANGE = 14;

// {identifier: "available" | "used" | "hidden"} for the zone's
// interactables ({identifier: config}): available to a player with an
// active use objective in this zone listing it that they haven't used it
// for yet; "used" once they have, if its whenUnavailable is "used" (drawn
// from its usedStamp, or its own stamp grayed); otherwise hidden, as it is
// to anyone without such an objective.
export function interactableStates(interactables, activeQuests, zoneIdentifier) {
  const wanted = new Set();
  const done = new Set();
  for (const quest of Object.values(activeQuests ?? {})) {
    for (const {objective, used = [], count, required} of quest.objectives ?? []) {
      if (objective?.type !== "use" || objective.zone !== zoneIdentifier) continue;
      for (const identifier of objective.interactables ?? []) {
        if (used.includes(identifier)) done.add(identifier);
        else if (count < required) wanted.add(identifier);
      }
    }
  }
  return Object.fromEntries(Object.entries(interactables ?? {}).map(([identifier, config]) => [
    identifier,
    wanted.has(identifier) ? "available" : done.has(identifier) && config.whenUnavailable === "used" ? "used" : "hidden",
  ]));
}

// Whether a unit (at position, of radius feet) can use an interactable on
// its map.
export function inUseRange(position, radius, interactable) {
  return Math.hypot(interactable.position.x - position.x, interactable.position.y - position.y) <= USE_RANGE + radius;
}
