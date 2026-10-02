function seconds(n) {
  return `${Math.round(n * 10) / 10}s`;
}

// One-line description of a power for the area list, so it can be told
// apart from its siblings without opening it.
export function powerSummary(power) {
  const parts = [];
  if (power.maxRange != null) parts.push(`${power.maxRange} ft`);
  parts.push(power.castTime > 0 ? `${seconds(power.castTime)} cast` : "instant");
  if (power.cooldown > 0) parts.push(`${seconds(power.cooldown)} cd`);
  if (power.costAmount > 0) parts.push(`${power.costAmount} ${power.costType ?? ""}`.trim());
  const effectCount = (power.effects ?? []).length;
  parts.push(`${effectCount} effect${effectCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function statusSummary(status) {
  const count = (status.effects ?? []).length;
  return [status.treatAs, status.stacking, `${count} effect${count === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
}
