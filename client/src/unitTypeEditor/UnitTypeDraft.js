import {refForAbilityKey, abilityKeyForRef} from "./abilityRefs";
import {resourceTypeById} from "../resourceTypes";

// Starter shape for a freshly-picked tactics type (see
// Validators::TacticsValidator) - mirrors ClassDraft/AbilityDraft's own
// placeholder-on-type-switch methods.
function blankTactics(type) {
  if (type === "rotation" || type === "priorityRotation") return {type, powers: []};
  if (type === "scripted") return {type: "scripted", duration: 1.0, events: []};
  return {type: "randomAvailable"};
}

// Owns a unit type draft's data and every mutation the editor can make to
// it - the UI (UnitTypeEditor.jsx/UnitTypeFieldsPanel.jsx) only ever reads
// `.data` and calls this class's methods (see plans/editors-as-classes.md).
// Like ClassDraft, a power's $ref depends on the *unit type's own key* (see
// abilityRefs.js's relativePrefix), so UnitTypeDraft carries `unitTypeKey`
// alongside `.data`.
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

  // The availableAbilities key currently filling the power at index, or
  // null if it's empty or holds something this editor didn't write (see
  // abilityRefs.js#abilityKeyForRef).
  abilityKeyForPower(index) {
    return abilityKeyForRef(this.unitTypeKey, this.powers[index]);
  }

  setPower(index, abilityKey) {
    return this.updateEntryFields("powers", index, {$ref: refForAbilityKey(this.unitTypeKey, abilityKey), referenceTo: "ability"});
  }

  addPower(abilityKey) {
    return this.addEntry("powers", {$ref: refForAbilityKey(this.unitTypeKey, abilityKey), referenceTo: "ability"});
  }

  removePower(index) {
    return this.removeEntry("powers", index);
  }

  // Resolved names of the currently-selected powers, for the tactics
  // rotation/scripted pickers - availableAbilities isn't part of this
  // draft's own data (it's fetched/refreshed separately, see
  // UnitTypeEditor.jsx), so it's passed in rather than stored.
  currentPowerNames(availableAbilities) {
    return this.powers
      .map((entry) => {
        const key = abilityKeyForRef(this.unitTypeKey, entry);
        return key && availableAbilities[key]?.ability?.name;
      })
      .filter(Boolean);
  }
}
