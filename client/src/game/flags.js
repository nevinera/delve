// What the game client knows of its character's flags in this world (see
// plans/flags.md): the zone's preloaded flags, held or not, plus whatever
// it has asked Rails about since. Flags are "type/identifier" strings and
// never revoked, so a held flag stays held. Nothing reads it yet.
export class FlagCache {
  // heldFlags are the zone's listed flags the character holds (from the
  // play page); flagsUrl is the has-flag endpoint's base, absent when
  // playing a zone directly (no world character, so no flags).
  constructor({ heldFlags = [], flagsUrl = null, fetchFn = (...args) => fetch(...args) } = {}) {
    this.flagsUrl = flagsUrl;
    this.fetchFn = fetchFn;
    this.known = new Map(heldFlags.map((flag) => [flag, true]));
  }

  // Records the zone's listed flags (its "flags"): any not already known
  // to be held are known not to be.
  preload(zoneFlags = []) {
    for (const flag of zoneFlags) {
      if (!this.known.has(flag)) this.known.set(flag, false);
    }
  }

  // Whether the character holds flag: from the cache, or asked of Rails
  // (and cached) for a flag it hasn't seen. Rejects if Rails can't answer.
  async hasFlag(flag) {
    if (this.known.has(flag)) return this.known.get(flag);
    if (!this.flagsUrl) return false;
    const res = await this.fetchFn(`${this.flagsUrl}/${flag}`, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`Couldn't check flag ${flag} (${res.status})`);
    const { held } = await res.json();
    this.known.set(flag, held);
    return held;
  }

  // For when the character is granted flag mid-session.
  markHeld(flag) {
    this.known.set(flag, true);
  }
}
