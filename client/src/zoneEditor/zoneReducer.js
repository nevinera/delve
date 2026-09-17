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

// entryPoints/openConnections are plain "<mapIdentifier>/<connectionId>" ->
// value dicts (see docs/schema/zone.md), not the section-array shape
// abilityReducer's generic actions assume - these four give a connection's
// status (see connectionStatus.js) a place to write back to.
function setEntryPoint(state, key, requiredKey) {
  return {...state, entryPoints: {...(state.entryPoints ?? {}), [key]: requiredKey}};
}

function removeEntryPoint(state, key) {
  const entryPoints = {...(state.entryPoints ?? {})};
  delete entryPoints[key];
  return {...state, entryPoints};
}

function setOpenConnection(state, key, name) {
  return {...state, openConnections: {...(state.openConnections ?? {}), [key]: name}};
}

function removeOpenConnection(state, key) {
  const openConnections = {...(state.openConnections ?? {})};
  delete openConnections[key];
  return {...state, openConnections};
}

function removeZoneLink(state, index) {
  return {...state, zoneLinks: state.zoneLinks.filter((_, i) => i !== index)};
}

// Creates a new zoneLink between two open connections - assumed two-way and
// keyless for now, same as everywhere else in this editor (see
// ZoneMapConnectionsPanel). connectionA/connectionB are each {map,
// connection} (matching docs/schema/zone.md's ConnectionIdentifier shape).
function addZoneLink(state, connectionA, connectionB) {
  return {...state, zoneLinks: [...(state.zoneLinks ?? []), {connectionA, connectionB, oneWay: false, requiredKey: null}]};
}

export function zoneReducer(state, action) {
  switch (action.type) {
    case "REMOVE_MAP":
      return removeMap(state, action.index, action.mapIdentifier);
    case "SET_ENTRY_POINT":
      return setEntryPoint(state, action.key, action.requiredKey);
    case "REMOVE_ENTRY_POINT":
      return removeEntryPoint(state, action.key);
    case "SET_OPEN_CONNECTION":
      return setOpenConnection(state, action.key, action.name);
    case "REMOVE_OPEN_CONNECTION":
      return removeOpenConnection(state, action.key);
    case "REMOVE_ZONE_LINK":
      return removeZoneLink(state, action.index);
    case "ADD_ZONE_LINK":
      return addZoneLink(state, action.connectionA, action.connectionB);
    default:
      return abilityReducer(state, action);
  }
}
