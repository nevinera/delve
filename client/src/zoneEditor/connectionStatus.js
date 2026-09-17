// A connection is exactly one of open/entryPoint/openConnection/zoneLink at
// a time (see plans/zone-editor.md step 4) - this is the single source of
// truth both ZoneMapConnectionsPanel (the flat list) and, later, the graph
// (step 6) read to decide what to render for a given map/connection pair.
export function connectionKey(mapIdentifier, connectionIdentifier) {
  return `${mapIdentifier}/${connectionIdentifier}`;
}

export function connectionStatus(mapIdentifier, connectionIdentifier, {zoneLinks, entryPoints, openConnections}) {
  const linkIndex = (zoneLinks ?? []).findIndex(
    (link) =>
      (link.connectionA?.map === mapIdentifier && link.connectionA?.connection === connectionIdentifier) ||
      (link.connectionB?.map === mapIdentifier && link.connectionB?.connection === connectionIdentifier)
  );
  if (linkIndex !== -1) {
    const link = zoneLinks[linkIndex];
    const onSideA = link.connectionA?.map === mapIdentifier && link.connectionA?.connection === connectionIdentifier;
    return {type: "zoneLink", linkIndex, otherSide: onSideA ? link.connectionB : link.connectionA, oneWay: link.oneWay, requiredKey: link.requiredKey};
  }

  const key = connectionKey(mapIdentifier, connectionIdentifier);
  if (Object.prototype.hasOwnProperty.call(entryPoints ?? {}, key)) {
    return {type: "entryPoint", key, requiredKey: entryPoints[key]};
  }
  if (Object.prototype.hasOwnProperty.call(openConnections ?? {}, key)) {
    return {type: "openConnection", key, name: openConnections[key]};
  }

  return {type: "open", key};
}
