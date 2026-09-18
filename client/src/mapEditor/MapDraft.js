// Owns a map draft's data and every mutation the editor can make to it -
// barriers/connections/units, plus the image-derived fields
// (imageUrl/pixelDimensions). The UI (MapEditor.jsx and, via its
// dispatch-shim, MapCanvas.jsx/BarriersPanel.jsx/ConnectionsPanel.jsx/
// UnitsPanel.jsx) only ever reads `.data` and calls this class's methods
// (see plans/editors-as-classes.md).
//
// Immutable, like every other draft class: every mutator returns a new
// MapDraft rather than changing this one in place.
export class MapDraft {
  constructor(data) {
    this.data = data;
  }

  setField(field, value) {
    return new MapDraft({...this.data, [field]: value});
  }

  addEntry(section, entry) {
    const entries = this.data[section] ?? [];
    return new MapDraft({...this.data, [section]: [...entries, entry]});
  }

  removeEntry(section, index) {
    const entries = this.data[section] ?? [];
    return new MapDraft({...this.data, [section]: entries.filter((_, i) => i !== index)});
  }

  updateEntryField(section, index, field, value) {
    const entries = this.data[section] ?? [];
    const next = entries.map((entry, i) => (i === index ? {...entry, [field]: value} : entry));
    return new MapDraft({...this.data, [section]: next});
  }

  // ---- Barriers ----

  addWall() {
    return this.addEntry("barriers", {type: "wall", locations: []});
  }

  addCircle(location, radius) {
    return this.addEntry("barriers", {type: "circle", location, radius});
  }

  removeBarrier(index) {
    return this.removeEntry("barriers", index);
  }

  // "insert" mode - splices a new point in at pointIndex, shifting every
  // point after it along (see UiState#advanceBarrierPlacement for the
  // matching pointIndex+1 advance).
  insertBarrierPoint(barrierIndex, pointIndex, feet) {
    const locations = this.data.barriers[barrierIndex].locations;
    const next = [...locations.slice(0, pointIndex), feet, ...locations.slice(pointIndex)];
    return this.updateEntryField("barriers", barrierIndex, "locations", next);
  }

  // "edit" mode - replaces the point at pointIndex in place.
  setBarrierPoint(barrierIndex, pointIndex, feet) {
    const locations = this.data.barriers[barrierIndex].locations;
    const next = locations.map((loc, i) => (i === pointIndex ? feet : loc));
    return this.updateEntryField("barriers", barrierIndex, "locations", next);
  }

  // ---- Connections ----

  removeConnection(index) {
    return this.removeEntry("connections", index);
  }

  // A connection's `position` field is itself an object with an angle
  // alongside x/y - only x/y move on a re-placement, unlike `start`/`end`
  // (a line connection's endpoints), which are bare points replaced wholesale.
  setConnectionField(connectionIndex, field, feet) {
    if (field === "position") {
      const current = this.data.connections[connectionIndex].position;
      return this.updateEntryField("connections", connectionIndex, "position", {...current, x: feet.x, y: feet.y});
    }
    return this.updateEntryField("connections", connectionIndex, field, feet);
  }

  // ---- Units ----

  removeUnit(index) {
    return this.removeEntry("units", index);
  }

  // Keeps the unit's facing angle, only replaces x/y.
  setUnitPosition(unitIndex, feet) {
    const current = this.data.units[unitIndex].position;
    return this.updateEntryField("units", unitIndex, "position", {...current, x: feet.x, y: feet.y});
  }

  // `movement` is a single nested object (like `position`/`lootTable`), so
  // every field change here writes the whole updated object rather than a
  // deep-path update - same convention as those.
  updateMovement(unitIndex, fields) {
    const current = this.data.units[unitIndex].movement ?? {type: "still"};
    return this.updateEntryField("units", unitIndex, "movement", {...current, ...fields});
  }

  insertPatrolStep(unitIndex, stepIndex, feet) {
    const steps = this.data.units[unitIndex].movement.steps;
    const newStep = {position: {x: feet.x, y: feet.y, angle: 0}, movementRate: 0.5, waitTime: 1};
    const next = [...steps.slice(0, stepIndex), newStep, ...steps.slice(stepIndex)];
    return this.updateMovement(unitIndex, {steps: next});
  }

  setPatrolStep(unitIndex, stepIndex, feet) {
    const steps = this.data.units[unitIndex].movement.steps;
    const next = steps.map((step, i) => (i === stepIndex ? {...step, position: {x: feet.x, y: feet.y, angle: 0}} : step));
    return this.updateMovement(unitIndex, {steps: next});
  }

  setWanderLocation(unitIndex, feet) {
    return this.updateMovement(unitIndex, {location: {x: feet.x, y: feet.y}});
  }

  // ---- Groups ----
  // A group isn't real data of its own (docs/schema/unit.md's
  // groupIdentifier is just a plain string on each unit) - these just
  // read/write that one field across the affected units.

  // Already a member -> clear it; not a member -> set it, silently moving
  // the unit out of whatever other group it was in.
  toggleGroupMember(groupIdentifier, unitIndex) {
    const unit = this.data.units[unitIndex];
    const nextValue = unit.groupIdentifier === groupIdentifier ? null : groupIdentifier;
    return this.updateEntryField("units", unitIndex, "groupIdentifier", nextValue);
  }

  // The identifier *is* the group's identity, so renaming rewrites every
  // current member's groupIdentifier in one pass.
  renameGroup(oldName, newName) {
    const next = this.data.units.map((unit) => (unit.groupIdentifier === oldName ? {...unit, groupIdentifier: newName} : unit));
    return this.setField("units", next);
  }

  // ---- Image ----
  // pixelDimensions is derived from whatever image is actually loaded, not
  // authored - see MapEditor.jsx's sync effect, which calls this without
  // going through markDirty (loading/resizing the image shouldn't
  // spuriously invalidate a prior Validate pass the way a real field edit
  // should).

  setPixelDimensions(pixelDimensions) {
    return this.setField("pixelDimensions", pixelDimensions);
  }
}
