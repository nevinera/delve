import {feetToPixel, feetSpacingToPixelsX} from "./mapCoords";

// Draws the "this group is active" highlight: a translucent red ring around
// every member's token, plus a translucent red line between every *pair* of
// members (full mesh, not just list-adjacent pairs) - so the set reads as a
// set, not a chain. Shown whenever a group's row is hovered in UnitsPanel,
// or grouping mode is targeting it (which forces this on regardless of the
// pointer, same visual as a permanent hover - see MapEditor's
// groupingMode/hoveredGroupIdentifier and MapCanvas's groupIdentifier prop
// here, which is already resolved to "whichever one wins").
//
// Deliberately not part of the `.map-canvas-shapes` class UnitShapes/
// BarrierShapes/ConnectionShapes share - this is decorative only and must
// never intercept a click meant for the real token underneath (grouping
// mode's own click-to-toggle relies on that).
const GROUP_HIGHLIGHT_COLOR = "rgba(255, 64, 64, 0.6)";
const GROUP_LINE_COLOR = "rgba(255, 40, 40, 0.85)";
const DEFAULT_TOKEN_RADIUS_FEET = 2; // used only if the unit's type is missing from availableUnitTypes

export default function GroupShapes({units, pixelDimensions, feetDimensions, availableUnitTypes, groupIdentifier}) {
  if (!groupIdentifier) return null;

  const members = units
    .map((unit, i) => ({unit, i}))
    .filter(({unit}) => unit.groupIdentifier === groupIdentifier);
  if (members.length === 0) return null;

  const points = members.map(({unit}) => feetToPixel(unit.position.x, unit.position.y, pixelDimensions, feetDimensions));

  const lines = [];
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      lines.push([points[a], points[b]]);
    }
  }

  return (
    <svg className="map-group-highlight" width={pixelDimensions.width} height={pixelDimensions.height}>
      {lines.map(([p1, p2], i) => (
        <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={GROUP_LINE_COLOR} strokeWidth={4} />
      ))}
      {members.map(({unit}, i) => {
        const tokenRadiusFeet = availableUnitTypes[unit.unitType]?.tokenRadius ?? DEFAULT_TOKEN_RADIUS_FEET;
        const radiusPx = feetSpacingToPixelsX(tokenRadiusFeet, pixelDimensions, feetDimensions) + 4;
        return <circle key={i} cx={points[i].x} cy={points[i].y} r={radiusPx} fill="none" stroke={GROUP_HIGHLIGHT_COLOR} strokeWidth={4} />;
      })}
    </svg>
  );
}
