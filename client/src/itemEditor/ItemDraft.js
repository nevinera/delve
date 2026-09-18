import {WEAPON_SLOTS, maxSecondaries} from "./itemFieldOptions";

// Owns an item draft's data and every mutation the editor can make to it -
// the UI (ItemEditor.jsx/ItemFieldsPanel.jsx) only ever reads this class's
// accessors and calls its methods, so the domain rules (which fields a
// slot change invalidates, the secondaries cap) are unit-testable on their
// own, independent of React (see plans/editors-as-classes.md).
//
// Immutable, like a reducer: every mutator returns a *new* ItemDraft rather
// than changing this one in place - callers hold the current instance in
// React state and replace it wholesale (setDraft(draft.setSlot(...))).
export class ItemDraft {
  constructor(data) {
    this.data = data;
  }

  get slot() {
    return this.data.slot ?? "";
  }

  // Only meaningful for the off_hand slot - a shield is just an off_hand
  // item flagged as one, per docs/schema/item.md.
  get shield() {
    return this.slot === "off_hand" && this.data.shield === true;
  }

  get secondaries() {
    return Array.isArray(this.data.secondaries) ? this.data.secondaries : [];
  }

  get maxSecondaries() {
    return this.slot ? maxSecondaries(this.slot) : 0;
  }

  // ring/neck never itemize a primary stat, and a shield (not a real
  // weapon) doesn't either - see docs/schema/item.md.
  get primaryEligible() {
    return this.slot !== "ring" && this.slot !== "neck" && !this.shield;
  }

  // Only true weapon slots take a weaponType, and a shield doesn't.
  get weaponTypeEligible() {
    return WEAPON_SLOTS.includes(this.slot) && !this.shield;
  }

  setField(field, value) {
    return new ItemDraft({...this.data, [field]: value});
  }

  // Clears fields that stop being meaningful under the new slot, rather
  // than leaving stale values an author didn't intend to keep.
  setSlot(nextSlot) {
    const shieldUnderNextSlot = nextSlot === "off_hand" && this.data.shield === true;
    const updates = {slot: nextSlot};
    if (nextSlot !== "off_hand") updates.shield = false;
    if (!primaryEligibleFor(nextSlot, shieldUnderNextSlot)) updates.primary = null;
    if (!weaponTypeEligibleFor(nextSlot, shieldUnderNextSlot)) updates.weaponType = null;
    return new ItemDraft({...this.data, ...updates});
  }

  setShield(nextShield) {
    const updates = {shield: nextShield};
    if (nextShield) {
      updates.primary = null;
      updates.weaponType = null;
    }
    return new ItemDraft({...this.data, ...updates});
  }

  // No-op once the slot's cap is already reached and a new stat is being
  // added - the checkbox that would do this is disabled in the UI, but the
  // model enforces it too rather than trusting the caller.
  toggleSecondary(stat) {
    const has = this.secondaries.includes(stat);
    if (!has && this.secondaries.length >= this.maxSecondaries) return this;
    const next = has ? this.secondaries.filter((s) => s !== stat) : [...this.secondaries, stat];
    return this.setField("secondaries", next);
  }
}

function primaryEligibleFor(slot, shield) {
  return slot !== "ring" && slot !== "neck" && !shield;
}

function weaponTypeEligibleFor(slot, shield) {
  return WEAPON_SLOTS.includes(slot) && !shield;
}
