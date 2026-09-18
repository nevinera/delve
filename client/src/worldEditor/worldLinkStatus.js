// A zone's connection point (either an openConnection, addressed by its
// exposed name, or an entryPoint, addressed by its own raw
// "mapId/connectionId" key - see docs/schema/world.md's ZoneReference) is
// either open or linked by a worldLink. `kind` disambiguates the two pools
// - an openConnection's exposed name and an entryPoint's raw key are
// different string spaces that could otherwise collide.
export function worldLinkStatus(zoneKey, kind, connection, worldLinks) {
  const linkIndex = (worldLinks ?? []).findIndex(
    (link) =>
      (link.zoneA?.zone === zoneKey && link.zoneA?.kind === kind && link.zoneA?.connection === connection) ||
      (link.zoneB?.zone === zoneKey && link.zoneB?.kind === kind && link.zoneB?.connection === connection)
  );
  if (linkIndex === -1) return {type: "open"};

  const link = worldLinks[linkIndex];
  const onSideA = link.zoneA?.zone === zoneKey && link.zoneA?.kind === kind && link.zoneA?.connection === connection;
  return {type: "worldLink", linkIndex, otherSide: onSideA ? link.zoneB : link.zoneA, oneWay: link.oneWay, requiredKey: link.requiredKey};
}

// Serializes a WorldEntryPointIdentifier the same way docs/schema/world.md
// says (`"zoneId/entryPointKey"`) - used both as a World.entryPoints key
// and to look one up.
export function worldEntryPointKey(zoneKey, entryPointKey) {
  return `${zoneKey}/${entryPointKey}`;
}
