// What a character's specialization and talents come to. The game server has the same rule
// (combat/build.go), and game-server/internal/combat/testdata/build.json checks both.

export const SPEC_LEVEL = 10;

const grantedBy = (talent, spec) => (talent.grants ?? []).filter((g) => !g.spec || g.spec === spec);
const tiersOf = (made) => Object.keys(made.talents ?? {}).sort((a, b) => Number(a) - Number(b));

// The talents you can pick in a tier, given your specialization and what you picked above.
export function offeredTalents(made, tier, spec, above) {
  return (made.talents?.[tier] ?? []).filter((t) => grantedBy(t, spec).length > 0 && (!t.requires || t.requires === above));
}

// A build with what a character of this level can't have left out.
export function allowedBuild(made, build, level) {
  const out = { specialization: "", talents: {} };
  if (level >= SPEC_LEVEL && (made.specializations ?? []).some((s) => s.id === build?.specialization)) out.specialization = build.specialization;
  let above = "";
  for (const tier of tiersOf(made)) {
    const wanted = build?.talents?.[tier];
    const picked = Number(tier) <= level && offeredTalents(made, tier, out.specialization, above).some((t) => t.id === wanted) ? wanted : "";
    if (picked) out.talents[tier] = picked;
    above = picked;
  }
  return out;
}

const talentGrants = (made, build) =>
  tiersOf(made).flatMap((tier) => (made.talents[tier] ?? []).filter((t) => build?.talents?.[tier] && t.id === build.talents[tier]).flatMap((t) => grantedBy(t, build.specialization)));

// What a character of this level and allowed build knows of its class, lowest level first.
export function knownAbilities(made, level, build) {
  const chosen = new Set((made.specializations ?? []).flatMap((s) => s.abilities ?? []));
  for (const tier of Object.values(made.talents ?? {})) for (const talent of tier) for (const grant of talent.grants ?? []) if (grant.ability) chosen.add(grant.ability);
  const mine = new Set((made.specializations ?? []).find((s) => s.id === build?.specialization)?.abilities ?? []);
  for (const grant of talentGrants(made, build)) if (grant.ability) mine.add(grant.ability);
  const reached = (made.abilities ?? []).filter((a) => (a.level ?? 1) <= level && (mine.has(a.id) || !chosen.has(a.id)));
  const replaced = new Set(reached.map((a) => a.replaces).filter(Boolean));
  return reached.filter((a) => !replaced.has(a.id)).sort((a, b) => (a.level ?? 1) - (b.level ?? 1));
}

// The ids of the statuses a character of this level and allowed build always holds.
export function heldStatuses(made, level, build) {
  const spec = (made.specializations ?? []).find((s) => s.id === build?.specialization)?.status;
  return [
    ...(made.passives ?? []).filter((p) => (p.level ?? 1) <= level).map((p) => p.status),
    ...(made.mastery?.status ? [made.mastery.status] : []),
    ...(spec ? [spec] : []),
    ...talentGrants(made, build).flatMap((g) => (g.status ? [g.status] : [])),
  ];
}
