// Owns the zone's own domain data - same immutable, reducer-shaped API every
// other editor's draft class uses (see plans/editors-as-classes.md): every
// mutator returns a *new* ZoneDraft rather than mutating in place.
//
// Generic setField/addEntry/removeEntry/updateEntryField/updateEntryFields
// mirror abilityReducer's own generic action shapes exactly (zoneReducer
// used to fall through to abilityReducer for these) - real domain methods
// below cover the zone-specific mutations zoneReducer used to special-case.
export class ZoneDraft {
  constructor(data) {
    this.data = data;
  }

  setField(field, value) {
    return new ZoneDraft({...this.data, [field]: value});
  }

  addEntry(section, entry) {
    const entries = this.data[section] ?? [];
    return new ZoneDraft({...this.data, [section]: [...entries, entry]});
  }

  removeEntry(section, index) {
    const entries = this.data[section] ?? [];
    return new ZoneDraft({...this.data, [section]: entries.filter((_, i) => i !== index)});
  }

  updateEntryField(section, index, field, value) {
    const entries = this.data[section] ?? [];
    const next = entries.map((entry, i) => (i === index ? {...entry, [field]: value} : entry));
    return new ZoneDraft({...this.data, [section]: next});
  }

  updateEntryFields(section, index, fields) {
    const entries = this.data[section] ?? [];
    const next = entries.map((entry, i) => (i === index ? {...entry, ...fields} : entry));
    return new ZoneDraft({...this.data, [section]: next});
  }

  // Removing a map must also strip any zoneLinks/entryPoints/openConnections
  // that reference it - auto-strip, no confirm (see plans/zone-editor.md's
  // cascade-delete decision), since those would otherwise dangle: a
  // zoneLink points at a map by its `identifier` field via connectionA/B.map,
  // and entryPoints/openConnections keys are "<mapIdentifier>/<connectionId>".
  // mapIdentifier is the map's own `identifier` field, not the file key this
  // draft's $ref points at - the two are allowed to diverge (see real
  // content's gc1-goblin-cave-entrance.json, whose `identifier` is
  // "cave_entrance") - so the caller (which already has the resolved map
  // detail) passes it in rather than this method trying to derive it.
  removeMap(index, mapIdentifier) {
    const maps = this.data.maps.filter((_, i) => i !== index);
    if (!mapIdentifier) return new ZoneDraft({...this.data, maps});

    const zoneLinks = (this.data.zoneLinks ?? []).filter(
      (link) => link.connectionA?.map !== mapIdentifier && link.connectionB?.map !== mapIdentifier
    );
    const stripMapKeys = (entries) => Object.fromEntries(
      Object.entries(entries ?? {}).filter(([key]) => key.split("/")[0] !== mapIdentifier)
    );

    return new ZoneDraft({
      ...this.data,
      maps,
      zoneLinks,
      entryPoints: stripMapKeys(this.data.entryPoints),
      openConnections: stripMapKeys(this.data.openConnections),
    });
  }

  // entryPoints/openConnections are plain "<mapIdentifier>/<connectionId>" ->
  // value dicts (see docs/schema/zone.md), not the section-array shape the
  // generic methods above assume - these four give a connection's status
  // (see connectionStatus.js) a place to write back to.
  setEntryPoint(key, requiredKey) {
    return new ZoneDraft({...this.data, entryPoints: {...(this.data.entryPoints ?? {}), [key]: requiredKey}});
  }

  removeEntryPoint(key) {
    const entryPoints = {...(this.data.entryPoints ?? {})};
    delete entryPoints[key];
    return new ZoneDraft({...this.data, entryPoints});
  }

  setOpenConnection(key, name) {
    return new ZoneDraft({...this.data, openConnections: {...(this.data.openConnections ?? {}), [key]: name}});
  }

  removeOpenConnection(key) {
    const openConnections = {...(this.data.openConnections ?? {})};
    delete openConnections[key];
    return new ZoneDraft({...this.data, openConnections});
  }

  removeZoneLink(index) {
    return new ZoneDraft({...this.data, zoneLinks: this.data.zoneLinks.filter((_, i) => i !== index)});
  }

  // Creates a new zoneLink between two open connections - assumed two-way and
  // keyless for now, same as everywhere else in this editor (see
  // ZoneMapConnectionsPanel). connectionA/connectionB are each {map,
  // connection} (matching docs/schema/zone.md's ConnectionIdentifier shape).
  addZoneLink(connectionA, connectionB) {
    return new ZoneDraft({
      ...this.data,
      zoneLinks: [...(this.data.zoneLinks ?? []), {connectionA, connectionB, oneWay: false, requiredKey: null}],
    });
  }
}
