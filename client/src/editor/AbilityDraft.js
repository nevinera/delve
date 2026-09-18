import {placeholderEntry} from "./entryFieldSchema";
import {graphicFieldsFor, soundFieldsFor} from "./stockAssetFields";

// Owns an ability draft's data and every mutation the editor can make to
// it - the UI (AbilityEditor.jsx/AbilityFieldsPanel.jsx/StatusEditor.jsx)
// only ever reads `.data` and calls this class's methods, so the domain
// rules (what a stock-asset pick writes, what a new entry starts as) are
// unit-testable on their own, independent of React (see
// plans/editors-as-classes.md).
//
// Immutable, like a reducer: every mutator returns a *new* AbilityDraft
// rather than changing this one in place.
//
// Deliberately doesn't reach inside a nested entry's own sub-object (e.g. a
// status effect's `status`/`auraEffect`) - StatusEditor.jsx already
// composes those as plain, self-contained controlled values and bubbles
// the whole new object up through updateEntryField/updateEntryFields, the
// same way any other entry field does. Only the entry array itself
// (add/remove/update) and the ability's own top-level fields are this
// class's concern.
export class AbilityDraft {
  constructor(data) {
    this.data = data;
  }

  setField(field, value) {
    return new AbilityDraft({...this.data, [field]: value});
  }

  addEntry(section) {
    const entries = this.data[section] ?? [];
    return new AbilityDraft({...this.data, [section]: [...entries, placeholderEntry(section)]});
  }

  removeEntry(section, index) {
    const entries = this.data[section] ?? [];
    return new AbilityDraft({...this.data, [section]: entries.filter((_, i) => i !== index)});
  }

  updateEntryField(section, index, field, value) {
    return this.updateEntryFields(section, index, {[field]: value});
  }

  updateEntryFields(section, index, fields) {
    const entries = this.data[section] ?? [];
    const next = entries.map((entry, i) => (i === index ? {...entry, ...fields} : entry));
    return new AbilityDraft({...this.data, [section]: next});
  }

  // What picking a stock graphic/sound from the dropdown writes onto an
  // entry - see stockAssetFields.js for exactly which fields each kind sets.
  pickStockAsset(section, index, name, stockOptions) {
    const fields = section === "soundEffects" ? soundFieldsFor(name, stockOptions[name]) : graphicFieldsFor(name, stockOptions[name]);
    return this.updateEntryFields(section, index, fields);
  }

  pickStockIcon(name) {
    return this.setField("iconURL", `:${name}:`);
  }
}
