// Whether `tgt` is a valid attack target for `self`: not dead, and (when
// self is known) within maxRange feet.
export function canTargetUnit(self, tgt, maxRange = 60) {
  if (!tgt) return false;
  if (tgt.status === "dead") return false;
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
      (e) => e.status_identifier !== add.status_identifier
    );
    effects.push({
      status_identifier: add.status_identifier,
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
        (e) => e.status_identifier !== rem.status_identifier
      ),
    };
  }

  return next;
}
