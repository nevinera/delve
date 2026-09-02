// Read-only display helpers for the ability editor's right panel.

export function humanize(key) {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  const lower = spaced.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Singular label for a section, used both on its "Add" button and on each
// of its entries' headings ("graphicEffects" -> "Graphic effect").
export function entryTypeLabel(section) {
  return humanize(section).replace(/s$/, "");
}

export function entryHeading(section, index, entry) {
  const label = entryTypeLabel(section);
  const hint = entry.type ?? entry.when;
  return hint ? `${label} ${index + 1}: ${hint}` : `${label} ${index + 1}`;
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
