import {graphicFieldsFor} from "./stockAssetFields";

// Starter values for a newly-added/type-switched status effect (see
// Validators::StatusEffectValidator) - the minimum each type needs to
// already be valid, mirroring entryFieldSchema.js's placeholderEntry.
export function placeholderStatusEffect(type) {
  switch (type) {
    case "recurring":
      return {type: "recurring", tickRate: 1.0, onTick: "heal", amount: 1.0};
    case "none":
      return {type: "none"};
    default:
      return {type: "stat", statName: "damageDone", modifierType: "multiply", amount: 1.0};
  }
}

// Owns a PowerEffect's `status` sub-object (see Validators::StatusValidator/
// StatusEffectValidator/AuraEffectValidator) and every mutation the editor
// can make to it - a nested domain object reached *through* AbilityDraft
// (see its own statusFor/setStatus/addStatus/removeStatus), the same way
// StatusEditor.jsx only ever reads `.data` and calls this class's methods
// rather than composing status objects itself (see
// plans/editors-as-classes.md).
//
// Immutable, like AbilityDraft/ItemDraft: every mutator returns a new
// StatusDraft rather than changing this one in place.
export class StatusDraft {
  constructor(data) {
    this.data = data;
  }

  static blank() {
    return new StatusDraft({name: "", shortName: "", treatAs: "buff", stacking: "replace", effects: []});
  }

  get effects() {
    return this.data.effects ?? [];
  }

  setField(field, value) {
    return new StatusDraft({...this.data, [field]: value});
  }

  addAuraEffect() {
    return this.setField("auraEffect", {sourceURL: ""});
  }

  removeAuraEffect() {
    return this.setField("auraEffect", null);
  }

  updateAuraEffect(fields) {
    return this.setField("auraEffect", {...this.data.auraEffect, ...fields});
  }

  // What picking a stock graphic for the aura effect writes - same rule as
  // AbilityDraft#pickStockAsset, just always the graphic (not sound) shape,
  // since an aura effect is visual-only.
  pickAuraStockGraphic(name, stockGraphics) {
    return this.updateAuraEffect(graphicFieldsFor(name, stockGraphics[name]));
  }

  addStatusEffect(type = "stat") {
    return this.setField("effects", [...this.effects, placeholderStatusEffect(type)]);
  }

  removeStatusEffect(index) {
    return this.setField("effects", this.effects.filter((_, i) => i !== index));
  }

  setStatusEffectType(index, type) {
    return this.setField("effects", this.effects.map((effect, i) => (i === index ? placeholderStatusEffect(type) : effect)));
  }

  // Merges the given fields onto the effect at index - a null value deletes
  // that key entirely rather than storing a literal null, since a status
  // effect's fields are polymorphic on `type` and the validators check key
  // *presence*, not nullness (e.g. a stat effect's `school` must be absent,
  // not null, to mean "no school").
  updateStatusEffect(index, fields) {
    const next = this.effects.map((effect, i) => {
      if (i !== index) return effect;
      const updated = {...effect};
      for (const [key, value] of Object.entries(fields)) {
        if (value === null) delete updated[key];
        else updated[key] = value;
      }
      return updated;
    });
    return this.setField("effects", next);
  }
}
