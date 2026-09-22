import {refForAbilityKey, abilityKeyForRef} from "./powerRefs";

const BLANK_RESOURCE = {name: "", color: "888888", max: 100, defaultValue: 0, returnRate: 0, isFluid: false};

// Owns a class draft's data and every mutation the editor can make to it -
// the UI (ClassEditor.jsx/ClassFieldsPanel.jsx) only ever reads `.data` and
// calls this class's methods (see plans/editors-as-classes.md). Unlike
// ItemDraft/AbilityDraft, a power slot's $ref depends on the *class's own
// key* (see powerRefs.js's relativePrefix) - so ClassDraft carries
// `classKey` alongside `.data`, not just the data itself.
//
// Immutable, like every other draft class: every mutator returns a new
// ClassDraft rather than changing this one in place.
export class ClassDraft {
  constructor(data, classKey) {
    this.data = data;
    this.classKey = classKey;
  }

  setField(field, value) {
    return new ClassDraft({...this.data, [field]: value}, this.classKey);
  }

  addEntry(section, entry) {
    const entries = this.data[section] ?? [];
    return new ClassDraft({...this.data, [section]: [...entries, entry]}, this.classKey);
  }

  removeEntry(section, index) {
    const entries = this.data[section] ?? [];
    return new ClassDraft({...this.data, [section]: entries.filter((_, i) => i !== index)}, this.classKey);
  }

  updateEntryFields(section, index, fields) {
    const entries = this.data[section] ?? [];
    const next = entries.map((entry, i) => (i === index ? {...entry, ...fields} : entry));
    return new ClassDraft({...this.data, [section]: next}, this.classKey);
  }

  setColor(kind, value) {
    return this.setField("colors", {...this.data.colors, [kind]: value});
  }

  togglePrimaryStat(stat) {
    const current = this.data.primaryStats ?? [];
    const next = current.includes(stat) ? current.filter((s) => s !== stat) : [...current, stat];
    return this.setField("primaryStats", next);
  }

  // Rank i is only meaningful once every rank before it is filled, same as
  // a power slot - but unlike powers, an unranked slot is stored as an
  // explicit "" placeholder (not simply absent), so the ranking always has
  // exactly 5 entries. See ClassFieldsPanel's SecondaryStatsRanking.
  setSecondaryStatRank(index, stat) {
    const current = this.data.secondaryStats ?? [];
    const ranks = Array.from({length: 5}, (_, i) => current[i] ?? "");
    ranks[index] = stat;
    return this.setField("secondaryStats", ranks);
  }

  setWields(main, off) {
    return this.setField("wields", [main, off].filter(Boolean));
  }

  addResource() {
    return this.addEntry("resources", BLANK_RESOURCE);
  }

  removeResource(index) {
    return this.removeEntry("resources", index);
  }

  updateResourceField(index, field, value) {
    return this.updateEntryFields("resources", index, {[field]: value});
  }

  // Exactly one resource may be "primary" (docs/schema/character_class.md) -
  // marking one clears it from every other entry, rather than leaving it
  // possible to end up with two (or zero, once set).
  setPrimaryResource(index) {
    const resources = this.data.resources ?? [];
    const next = resources.map((resource, i) =>
      i === index ? {...resource, displayType: "primary"} : {...resource, displayType: null}
    );
    return this.setField("resources", next);
  }

  get powers() {
    return this.data.powers ?? [];
  }

  // The availableAbilities key currently filling slot `index`, or null if
  // it's empty or holds something this editor didn't write (see
  // powerRefs.js#abilityKeyForRef).
  abilityKeyForPowerSlot(index) {
    return index < this.powers.length ? abilityKeyForRef(this.classKey, this.powers[index]) : null;
  }

  // Slot i is only pickable once slot i-1 is filled (see
  // ClassFieldsPanel's PowerSlots) - filling an already-filled slot
  // replaces it in place; filling the first empty one appends.
  setPowerSlot(index, abilityKey) {
    const entry = {$ref: refForAbilityKey(this.classKey, abilityKey), referenceTo: "ability"};
    if (index < this.powers.length) return this.updateEntryFields("powers", index, entry);
    return this.addEntry("powers", entry);
  }

  // Clearing a middle slot reflows the ones after it, rather than leaving a
  // gap the saved `powers` array has no way to represent - REMOVE_ENTRY's
  // splice semantics already do this for free.
  clearPowerSlot(index) {
    return this.removeEntry("powers", index);
  }
}
