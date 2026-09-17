import {abilityReducer} from "../editor/abilityReducer";

// Removing a map must also strip any zoneLinks/entryPoints/openConnections
// that reference it - auto-strip, no confirm (see plans/zone-editor.md's
// cascade-delete decision), since those would otherwise dangle: a zoneLink
// points at a map by its `identifier` field via connectionA/B.map, and
// entryPoints/openConnections keys are "<mapIdentifier>/<connectionId>".
// mapIdentifier is the map's own `identifier` field, not the file key the
// zone draft's $ref points at - the two are allowed to diverge (see real
// content's gc1-goblin-cave-entrance.json, whose `identifier` is
// "cave_entrance") - so the caller (which already has the resolved map
// detail) passes it in rather than this reducer trying to derive it.
function removeMap(state, index, mapIdentifier) {
  const maps = state.maps.filter((_, i) => i !== index);
  if (!mapIdentifier) return {...state, maps};

  const zoneLinks = (state.zoneLinks ?? []).filter(
    (link) => link.connectionA?.map !== mapIdentifier && link.connectionB?.map !== mapIdentifier
  );
  const stripMapKeys = (entries) => Object.fromEntries(
    Object.entries(entries ?? {}).filter(([key]) => key.split("/")[0] !== mapIdentifier)
  );

  return {
    ...state,
    maps,
    zoneLinks,
    entryPoints: stripMapKeys(state.entryPoints),
    openConnections: stripMapKeys(state.openConnections),
  };
}

export function zoneReducer(state, action) {
  if (action.type === "REMOVE_MAP") return removeMap(state, action.index, action.mapIdentifier);
  return abilityReducer(state, action);
}
