// Keeps the auras that last as long as a status in step with who has what, however each one came or
// went: a status landing or ending, or someone coming into sight or going out of it.
export class LastingAuras {
  constructor(stage) {
    this.stage = stage;
    this.shown = new Map(); // key -> { live, mesh }
  }

  // wanted: key -> { unit, aura }, every status-long aura there should be.
  sync(wanted) {
    for (const [key, { live, mesh }] of this.shown) {
      if (wanted.get(key)?.unit.mesh === mesh) continue;
      this.stage.endAura(live);
      this.shown.delete(key);
    }
    for (const [key, { unit, aura }] of wanted) {
      if (!this.shown.has(key)) this.shown.set(key, { live: this.stage.aura(unit, aura), mesh: unit.mesh });
    }
  }
}
