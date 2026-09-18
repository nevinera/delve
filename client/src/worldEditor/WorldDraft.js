// Owns the world's own domain data - same immutable, reducer-shaped API
// every other editor's draft class uses (see plans/editors-as-classes.md):
// every mutator returns a *new* WorldDraft rather than mutating in place.
//
// Generic setField/addEntry/removeEntry/updateEntryField/updateEntryFields
// mirror ZoneDraft's own generic section-array methods exactly (worldLinks
// is the only array-of-objects section here) - zones/entryPoints are plain
// key -> value dicts instead (see docs/schema/world.md), so they get their
// own dict-shaped methods below, same split ZoneDraft makes for
// entryPoints/openConnections.
export class WorldDraft {
  constructor(data) {
    this.data = data;
  }

  setField(field, value) {
    return new WorldDraft({...this.data, [field]: value});
  }

  addEntry(section, entry) {
    const entries = this.data[section] ?? [];
    return new WorldDraft({...this.data, [section]: [...entries, entry]});
  }

  removeEntry(section, index) {
    const entries = this.data[section] ?? [];
    return new WorldDraft({...this.data, [section]: entries.filter((_, i) => i !== index)});
  }

  updateEntryField(section, index, field, value) {
    const entries = this.data[section] ?? [];
    const next = entries.map((entry, i) => (i === index ? {...entry, [field]: value} : entry));
    return new WorldDraft({...this.data, [section]: next});
  }

  updateEntryFields(section, index, fields) {
    const entries = this.data[section] ?? [];
    const next = entries.map((entry, i) => (i === index ? {...entry, ...fields} : entry));
    return new WorldDraft({...this.data, [section]: next});
  }

  // zones is a plain "<zoneKey>" -> {path, name, description} dict, not
  // the section-array shape the generic methods above assume.
  setZone(key, entry) {
    return new WorldDraft({...this.data, zones: {...(this.data.zones ?? {}), [key]: entry}});
  }

  // name/description are cached copies of the referenced zone's own
  // fields (see docs/schema/world.md's WorldZoneEntry) - derived, not
  // typed by hand, so there's no generic field setter for them (unlike
  // ItemDraft, which lets any field be set directly). This is the only
  // way they ever change: the editor fetches each zone's own file (see
  // worldContentLoaders.js#zoneDetailsFor) and syncs whatever it found
  // back in here, on add and on demand ("Refresh Connections"). `details`
  // is that same {key: {name, description, ...}} shape; entries for a key
  // not already in `zones` are ignored.
  syncZoneDetails(details) {
    const zones = {...(this.data.zones ?? {})};
    for (const [key, detail] of Object.entries(details ?? {})) {
      if (!zones[key]) continue;
      zones[key] = {...zones[key], name: detail.name, description: detail.description ?? null};
    }
    return new WorldDraft({...this.data, zones});
  }

  // Removing a zone must also strip any worldLinks/entryPoints that
  // reference it, so nothing dangles - same cascade-delete reasoning
  // ZoneDraft#removeMap uses one level down, for maps within a zone.
  removeZone(key) {
    const zones = {...(this.data.zones ?? {})};
    delete zones[key];
    const worldLinks = (this.data.worldLinks ?? []).filter(
      (link) => link.zoneA?.zone !== key && link.zoneB?.zone !== key
    );
    const entryPoints = {...(this.data.entryPoints ?? {})};
    delete entryPoints[key];
    return new WorldDraft({...this.data, zones, worldLinks, entryPoints});
  }

  // entryPoints is keyed by serialized "<zoneKey>/<entryPointKey>" (see
  // docs/schema/world.md's WorldEntryPointIdentifier) - a World's own
  // entryPoints target one specific one of a zone's own entryPoints, the
  // actual "portal" a character spawns through.
  setEntryPoint(key, requiredKey) {
    return new WorldDraft({...this.data, entryPoints: {...(this.data.entryPoints ?? {}), [key]: requiredKey}});
  }

  removeEntryPoint(key) {
    const entryPoints = {...(this.data.entryPoints ?? {})};
    delete entryPoints[key];
    return new WorldDraft({...this.data, entryPoints});
  }

  removeWorldLink(index) {
    return new WorldDraft({...this.data, worldLinks: (this.data.worldLinks ?? []).filter((_, i) => i !== index)});
  }

  // Merges one field onto a worldLink's zoneA/zoneB side. Changing zone or
  // kind invalidates whatever connection was picked under the old one -
  // it's almost certainly not a valid choice in the new pool - the same
  // domain rule ItemDraft#setSlot enforces for a slot change one level
  // over, kept here rather than in WorldLinksPanel so it stays
  // unit-testable independent of React (see plans/editors-as-classes.md).
  updateWorldLinkSide(index, side, field, value) {
    const worldLinks = this.data.worldLinks ?? [];
    const next = worldLinks.map((link, i) => {
      if (i !== index) return link;
      const nextSide = {...link[side], [field]: value};
      if (field === "zone" || field === "kind") nextSide.connection = "";
      return {...link, [side]: nextSide};
    });
    return new WorldDraft({...this.data, worldLinks: next});
  }

  // Creates a new worldLink between two zones' open connections - assumed
  // two-way and keyless for now, same starting point ZoneDraft#addZoneLink
  // uses one level down. zoneA/zoneB are each {zone, connection} (matching
  // docs/schema/world.md's ZoneReference shape).
  addWorldLink(zoneA, zoneB) {
    return new WorldDraft({
      ...this.data,
      worldLinks: [...(this.data.worldLinks ?? []), {zoneA, zoneB, oneWay: false, requiredKey: null}],
    });
  }
}
