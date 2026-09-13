// Renders an ability's icon button, falling back to a text badge (its
// initials) when it has no iconURL - unit-type powers in particular are
// often authored without one, and hiding the button (or showing a broken
// image) would make an ability impossible to preview/test from here.
// `className` should already carry the sizing/position/interaction styles
// (e.g. "power-slot-icon" or "ability-icon-button") that the caller's own
// layout defines for both the image and fallback cases.
export default function AbilityIcon({ability, className, onClick}) {
  if (ability.iconURL) {
    return <img src={ability.iconURL} alt={ability.name} className={className} onClick={onClick} />;
  }

  const initials = (ability.name ?? "").trim().slice(0, 2).toUpperCase() || "?";
  return (
    <div className={`${className} ability-icon-fallback`} onClick={onClick} role="button" tabIndex={0}>
      {initials}
    </div>
  );
}
