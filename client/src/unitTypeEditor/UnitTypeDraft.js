import {resourceTypeById} from "../resourceTypes";
import {uniqueName} from "../powersEditor/uniqueName";
import {EXCLUSIVE_ROLES} from "../balanceTargets";

// Starter shape for a freshly-picked tactics type (see
// Validators::TacticsValidator) - mirrors ClassDraft/AbilityDraft's own
// placeholder-on-type-switch methods.
function blankTactics(type) {
  if (type === "rotation" || type === "priorityRotation") return {type, powers: []};
  if (type === "scripted") return {type: "scripted", duration: 1.0, events: []};
  return {type: "randomAvailable"};
}

function renameTacticsPower(tactics, from, to) {
  if (!tactics) return tactics;
  const rename = (name) => (name === from ? to : name);
  const next = {...tactics};
  if (tactics.powers) next.powers = tactics.powers.map(rename);
  if (tactics.events) next.events = tactics.events.map((e) => ({...e, power: rename(e.power)}));
  return next;
}

// Owns a unit type draft's data and every mutation the editor can make to
// it - the UI (UnitTypeWorkbench.jsx/UnitTypeFieldsPanel.jsx) only ever reads
// `.data` and calls this class's methods (see plans/editors-as-classes.md).
// Powers are stored inline (full Ability objects, no $refs); tactics refer
// to them by name.
//
// Immutable, like every other draft class: every mutator returns a new
// UnitTypeDraft rather than changing this one in place.
export class UnitTypeDraft {
  constructor(data, unitTypeKey) {
    this.data = data;
    this.unitTypeKey = unitTypeKey;
  }

  setField(field, value) {
    return new UnitTypeDraft({...this.data, [field]: value}, this.unitTypeKey);
  }

  addEntry(section, entry) {
    const entries = this.data[section] ?? [];
    return new UnitTypeDraft({...this.data, [section]: [...entries, entry]}, this.unitTypeKey);
  }

  removeEntry(section, index) {
    const entries = this.data[section] ?? [];
    return new UnitTypeDraft({...this.data, [section]: entries.filter((_, i) => i !== index)}, this.unitTypeKey);
  }

  updateEntryFields(section, index, fields) {
    const entries = this.data[section] ?? [];
    const next = entries.map((entry, i) => (i === index ? {...entry, ...fields} : entry));
    return new UnitTypeDraft({...this.data, [section]: next}, this.unitTypeKey);
  }

  // Balance tags (see balanceTargets.js's TAG_CATEGORIES). An empty list
  // drops the field.
  get tags() {
    return this.data.tags ?? [];
  }

  setTags(tags) {
    if (tags.length > 0) return this.setField("tags", tags);
    const {tags: _dropped, ...rest} = this.data;
    return new UnitTypeDraft(rest, this.unitTypeKey);
  }

  // Replaces whichever of options is set (at most one) with tag, or clears
  // it when tag is null.
  setExclusiveTag(options, tag) {
    const rest = this.tags.filter((t) => !options.includes(t));
    return this.setTags(tag ? [...rest, tag] : rest);
  }

  // Adds or removes a role tag; adding tough drops glass and vice versa.
  toggleRoleTag(tag) {
    if (this.tags.includes(tag)) return this.setTags(this.tags.filter((t) => t !== tag));
    return this.setTags([...this.tags.filter((t) => t !== EXCLUSIVE_ROLES[tag]), tag]);
  }

  get tokenImageUrls() {
    return this.data.tokenImageUrl ?? [];
  }

  addTokenImage() {
    return this.setField("tokenImageUrl", [...this.tokenImageUrls, ""]);
  }

  removeTokenImage(index) {
    return this.setField("tokenImageUrl", this.tokenImageUrls.filter((_, i) => i !== index));
  }

  updateTokenImage(index, url) {
    return this.setField("tokenImageUrl", this.tokenImageUrls.map((u, i) => (i === index ? url : u)));
  }

  // The resource picker (RESOURCE_TYPES, i.e. config/resource_types.json)
  // offers a fixed list plus "none" (id null/""); picking one replaces the
  // whole resource with that preset's full details rather than editing
  // fields in place, since unit types no longer hand-author them.
  setResourceType(id) {
    if (!id) {
      const {resource: _dropped, ...rest} = this.data;
      return new UnitTypeDraft(rest, this.unitTypeKey);
    }
    const preset = resourceTypeById(id);
    if (!preset) return this;
    const {id: _presetId, ...resource} = preset;
    return this.setField("resource", resource);
  }

  setTargetingType(type) {
    return this.setField("targeting", {type});
  }

  setTacticsType(type) {
    return this.setField("tactics", blankTactics(type));
  }

  setTacticsDuration(duration) {
    return this.setField("tactics", {...this.data.tactics, duration: duration ?? 0});
  }

  addRotationPower(defaultPower) {
    const tactics = this.data.tactics;
    return this.setField("tactics", {...tactics, powers: [...(tactics.powers ?? []), defaultPower]});
  }

  removeRotationPower(index) {
    const tactics = this.data.tactics;
    return this.setField("tactics", {...tactics, powers: (tactics.powers ?? []).filter((_, i) => i !== index)});
  }

  updateRotationPower(index, value) {
    const tactics = this.data.tactics;
    return this.setField("tactics", {...tactics, powers: (tactics.powers ?? []).map((p, i) => (i === index ? value : p))});
  }

  addScriptedEvent(defaultPower) {
    const tactics = this.data.tactics;
    return this.setField("tactics", {...tactics, events: [...(tactics.events ?? []), {power: defaultPower, at: 0}]});
  }

  removeScriptedEvent(index) {
    const tactics = this.data.tactics;
    return this.setField("tactics", {...tactics, events: (tactics.events ?? []).filter((_, i) => i !== index)});
  }

  updateScriptedEvent(index, field, value) {
    const tactics = this.data.tactics;
    return this.setField("tactics", {...tactics, events: (tactics.events ?? []).map((e, i) => (i === index ? {...e, [field]: value} : e))});
  }

  get powers() {
    return this.data.powers ?? [];
  }

  get powerNames() {
    return this.powers.map((power) => power.name).filter(Boolean);
  }

  addPower(ability) {
    return this.addEntry("powers", {...ability, name: uniqueName(ability.name || "New Power", this.powerNames)});
  }

  removePower(index) {
    return this.removeEntry("powers", index);
  }

  // Replaces the power at index. A rename carries through to every tactics
  // entry that named the old power, so the rotation/script keeps working.
  updatePower(index, ability) {
    const oldName = this.powers[index]?.name;
    const next = new UnitTypeDraft({...this.data, powers: this.powers.map((p, i) => (i === index ? ability : p))}, this.unitTypeKey);
    if (!oldName || oldName === ability.name) return next;
    return next.setField("tactics", renameTacticsPower(this.data.tactics, oldName, ability.name ?? ""));
  }
}
