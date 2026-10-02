import {uniqueName} from "../powersEditor/uniqueName";
import {MAX_PASSIVES, MAX_RESOURCES, SLOT_COUNT} from "./classFieldOptions";

const BLANK_RESOURCE = {name: "", color: "888888", max: 100, defaultValue: 0, returnRate: 0, isFluid: false};

// Passives must be inherent (hidden) - see docs/schema/character_class.md.
const BLANK_PASSIVE = {name: "New Passive", shortName: "", treatAs: "inherent", stacking: "replace", effects: []};

// Owns a class draft's data and every mutation the editor can make to it -
// the UI (ClassEditor.jsx/ClassFieldsPanel.jsx) only ever reads `.data` and
// calls this class's methods (see plans/editors-as-classes.md). Powers
// (the action bar, in slot order) and passives are stored inline.
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
    if ((this.data.resources ?? []).length >= MAX_RESOURCES) return this;
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

  get powerNames() {
    return this.powers.map((power) => power.name).filter(Boolean);
  }

  get actionBarFull() {
    return this.powers.length >= SLOT_COUNT;
  }

  addPower(ability) {
    if (this.actionBarFull) return this;
    return this.addEntry("powers", {...ability, name: uniqueName(ability.name || "New Power", this.powerNames)});
  }

  updatePower(index, ability) {
    return this.setField("powers", this.powers.map((p, i) => (i === index ? ability : p)));
  }

  removePower(index) {
    return this.removeEntry("powers", index);
  }

  // Moves the power at index one slot earlier (delta -1) or later (+1).
  movePower(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= this.powers.length) return this;
    const next = [...this.powers];
    [next[index], next[target]] = [next[target], next[index]];
    return this.setField("powers", next);
  }

  get passives() {
    return this.data.passives ?? [];
  }

  get passivesFull() {
    return this.passives.length >= MAX_PASSIVES;
  }

  addPassive() {
    if (this.passivesFull) return this;
    const name = uniqueName(BLANK_PASSIVE.name, this.passives.map((p) => p.name));
    return this.addEntry("passives", {...BLANK_PASSIVE, name});
  }

  updatePassive(index, status) {
    return this.setField("passives", this.passives.map((p, i) => (i === index ? status : p)));
  }

  removePassive(index) {
    return this.removeEntry("passives", index);
  }
}
