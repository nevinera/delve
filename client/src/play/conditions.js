// Conditions: what an ability's `requires` asks. The game server decides (combat/conditions.go), and
// this lets the client grey out what it won't take. Both run the same cases, in
// game-server/internal/combat/testdata/conditions.json. A fact the client hasn't got, left undefined,
// counts as holding, so it only greys out what it's sure of.

const READS = ["health", "status", "not", "anyOf", "targetIs", "state", "inCombat", "position", "since", "resource"];
const reads = (c) => READS.some((key) => key in c);
const inRange = (n, c) => (c.below === undefined || n < c.below) && (c.above === undefined || n > c.above);

export function holds(c, facts) {
  if (!reads(c)) return true;
  const who = c.on === "target" || c.health === "target" ? facts.target : facts.self;
  if (c.not) return !reads(c.not) || !holds(c.not, facts);
  if (c.anyOf) return c.anyOf.some((each) => holds(each, facts));
  if (c.health) return Boolean(who?.maxHealth) && inRange((100 * who.health) / who.maxHealth, c);
  if (c.status) return Boolean(who) && (who.statuses?.[c.status] ?? 0) >= Math.max(c.stacks ?? 1, 1);
  if (c.targetIs) return facts.targetIs === undefined || facts.targetIs.includes(c.targetIs);
  if (c.state) {
    if (!who) return false;
    return who.state === undefined || who.state.includes(c.state);
  }
  if ("inCombat" in c) return facts.self.state === undefined || facts.self.state.includes("inCombat") === c.inCombat;
  if (c.position) return facts.position === undefined || (Boolean(facts.target) && facts.position === c.position);
  if (c.since) {
    if (facts.since === undefined) return true;
    return c.since in facts.since ? inRange(facts.since[c.since], c) : c.above !== undefined;
  }
  const resource = facts.resources?.[c.resource];
  if (!resource) return false;
  return c.percent ? resource.max > 0 && inRange((100 * resource.have) / resource.max, c) : inRange(resource.have, c);
}

export const allHold = (list = [], facts) => list.every((c) => holds(c, facts));
