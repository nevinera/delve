// Whether status is one the server would refuse to target (matches
// UnitStatus.IsTargetable in the game server: dead, or mid-respawn and not
// yet back).
export function isUntargetableStatus(status) {
  return status === "dead" || status === "respawning";
}

// Whether `tgt` is a valid attack target for `self`: not dead or respawning,
// and (when self is known) within maxRange feet.
export function canTargetUnit(self, tgt, maxRange = 60) {
  if (!tgt) return false;
  if (isUntargetableStatus(tgt.status)) return false;
  if (self) {
    const dx = tgt.position.x - self.position.x;
    const dy = tgt.position.y - self.position.y;
    if (Math.sqrt(dx * dx + dy * dy) > maxRange) return false;
  }
  return true;
}

export function applyFullState(msg) {
  return { ...msg.units };
}

// NCUs (non-combat units) sync separately from units: a full map on
// instance-state, then new/moved entries in a delta's ncu_updates. They're
// never removed.
export function applyFullNCUs(msg) {
  return { ...(msg.ncus ?? {}) };
}

export function applyNCUDelta(ncus, msg) {
  const updates = msg.ncu_updates;
  if (!updates) return ncus;
  const next = { ...ncus };
  for (const [id, patch] of Object.entries(updates)) {
    next[id] = { ...next[id], ...patch };
  }
  return next;
}

export function applyDelta(units, msg) {
  const next = { ...units };

  for (const [id, patch] of Object.entries(msg.unit_updates ?? {})) {
    next[id] = next[id] ? { ...next[id], ...patch } : { ...patch };
  }

  for (const id of msg.unit_removals ?? []) {
    delete next[id];
  }

  for (const add of msg.effect_adds ?? []) {
    const unit = next[add.unit_id];
    if (!unit) continue;
    const effects = (unit.active_status_effects ?? []).filter(
      (e) => !(e.status_name === add.status_name && e.applier_id === add.applier_id)
    );
    effects.push({
      status_name: add.status_name,
      applier_id: add.applier_id,
      stacks: add.stacks,
      expires_at: add.expires_at,
    });
    next[add.unit_id] = { ...unit, active_status_effects: effects };
  }

  for (const rem of msg.effect_removes ?? []) {
    const unit = next[rem.unit_id];
    if (!unit) continue;
    next[rem.unit_id] = {
      ...unit,
      active_status_effects: (unit.active_status_effects ?? []).filter(
        (e) => !(e.status_name === rem.status_name && e.applier_id === rem.applier_id)
      ),
    };
  }

  return next;
}
