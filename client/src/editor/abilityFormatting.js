// Read-only display helpers mirroring app/helpers/build/abilities_helper.rb,
// reimplemented client-side since this panel renders from live JS state
// rather than server-rendered HTML.

export function humanize(key) {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  const lower = spaced.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function scalarFields(ability) {
  return Object.entries(ability).filter(([, value]) => !Array.isArray(value));
}

export function listFields(ability) {
  return Object.entries(ability).filter(([, value]) => Array.isArray(value));
}

export function entrySummary(entry, index) {
  const hint = entry.type ?? entry.when;
  return hint ? `${index + 1}. ${hint}` : `${index + 1}`;
}

export function formatValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value.toString();
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, v]) => `${humanize(key)}: ${formatValue(v)}`)
      .join("; ");
  }
  return String(value);
}
