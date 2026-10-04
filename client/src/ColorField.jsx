// A color picker for a content Color field (see docs/schema/common.md#color):
// 6 hex digits, optionally led by "#". A picked color keeps the value's
// existing style - no "#" if the current value has none - so picking
// doesn't churn every color in a file. An unset value shows `emptyLabel`
// (the picker itself shows `fallback`), and `clearable` offers a Clear
// button for optional fields.
const HEX = /^#?[0-9a-fA-F]{6}$/;

export function withHash(color) {
  if (!color) return null;
  return color.startsWith("#") ? color : `#${color}`;
}

export default function ColorField({value, onChange, emptyLabel = "not set", fallback = "#ffffff", clearable = false, label = "Pick color"}) {
  const valid = typeof value === "string" && HEX.test(value);
  const shown = valid ? withHash(value).toLowerCase() : fallback;
  const keepHash = !(valid && !value.startsWith("#"));

  function pick(hex) {
    onChange(keepHash ? hex : hex.replace(/^#/, ""));
  }

  return (
    <div className="color-field">
      <input type="color" aria-label={label} value={shown} onChange={(e) => pick(e.target.value)} />
      <span>{value ? value : emptyLabel}</span>
      {clearable && value && <button type="button" onClick={() => onChange(null)}>Clear</button>}
    </div>
  );
}
