import { isUntargetableStatus } from "./state";

// Feet between token edges within which a player can start (and keep) a
// conversation with an NCU.
export const TALK_RANGE = 10;

export function hasDialogue(dialogue) {
  return Array.isArray(dialogue) && dialogue.length > 0;
}

export function inTalkRange(self, ncu) {
  if (!self || !ncu) return false;
  if (self.map_identifier !== ncu.map_identifier) return false;
  const dx = ncu.position.x - self.position.x;
  const dy = ncu.position.y - self.position.y;
  return Math.sqrt(dx * dx + dy * dy) <= TALK_RANGE + (self.radius ?? 0) + (ncu.radius ?? 0);
}

// Whether an open conversation should stay open: the player is still alive
// and in range.
export function canKeepTalking(self, ncu) {
  return !!self && !isUntargetableStatus(self.status) && inTalkRange(self, ncu);
}

export function canTalkTo(self, ncu, dialogue) {
  return hasDialogue(dialogue) && canKeepTalking(self, ncu);
}
