import { isUntargetableStatus } from "./state";

// Feet between token edges within which a player can start (and keep) a
// conversation.
export const TALK_RANGE = 10;

export function hasDialogue(unit, dialogue) {
  return !!unit?.noncombat && Array.isArray(dialogue) && dialogue.length > 0;
}

export function inTalkRange(self, unit) {
  if (!self || !unit) return false;
  if (self.map_identifier !== unit.map_identifier) return false;
  const dx = unit.position.x - self.position.x;
  const dy = unit.position.y - self.position.y;
  return Math.sqrt(dx * dx + dy * dy) <= TALK_RANGE + (self.radius ?? 0) + (unit.radius ?? 0);
}

export function canTalkTo(self, unit, dialogue) {
  if (isUntargetableStatus(self?.status)) return false;
  return hasDialogue(unit, dialogue) && inTalkRange(self, unit);
}
