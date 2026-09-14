import {feetToPixel, feetSpacingToPixelsX} from "./mapCoords";

// Renders each unit as its actual token image (from availableUnitTypes,
// see MapEditor/Build::MapsController#available_unit_types), circularly
// clipped and sized to the unit type's real tokenRadius (feet) - not a
// generic marker - so units show up at their true in-game footprint
// relative to the map. Falls back to a plain hostility-colored circle
// (same radius) when there's no tokenImageUrl, or the unit type isn't
// found (e.g. deleted since this unit was placed).
const HOSTILITY_COLORS = {hostile: "#e05a5a", neutral: "#d9b64a", friendly: "#5ac07a"};
const SELECTED_RING_COLOR = "#ffb0b0";
const HOVER_RING_COLOR = "#fff";
const DEFAULT_TOKEN_RADIUS_FEET = 2; // used only if the unit's type is missing from availableUnitTypes

export default function UnitShapes({units, pixelDimensions, feetDimensions, tool, availableUnitTypes, selectedIndex, hoveredIndex, onSelect, onStartDrag}) {
  const selectable = tool === "select";

  return (
    <svg className="map-canvas-shapes" width={pixelDimensions.width} height={pixelDimensions.height}>
      {units.map((unit, i) => {
        const info = availableUnitTypes[unit.unitType];
        const tokenRadiusFeet = info?.tokenRadius ?? DEFAULT_TOKEN_RADIUS_FEET;
        const p = feetToPixel(unit.position.x, unit.position.y, pixelDimensions, feetDimensions);
        const radiusPx = feetSpacingToPixelsX(tokenRadiusFeet, pixelDimensions, feetDimensions);
        const selected = selectable && selectedIndex === i;
        const hovered = hoveredIndex === i;
        const ringColor = selected ? SELECTED_RING_COLOR : hovered ? HOVER_RING_COLOR : "#000";
        const clipId = `map-unit-token-clip-${i}`;

        return (
          <g key={i} onPointerDown={selectable ? (e) => onStartDrag(i, e) : undefined}>
            {info?.tokenImageUrl
              ? (
                <>
                  <clipPath id={clipId}>
                    <circle cx={p.x} cy={p.y} r={radiusPx} />
                  </clipPath>
                  <image
                    href={info.tokenImageUrl}
                    x={p.x - radiusPx} y={p.y - radiusPx} width={radiusPx * 2} height={radiusPx * 2}
                    clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice"
                  />
                </>
              )
              : <circle cx={p.x} cy={p.y} r={radiusPx} fill={HOSTILITY_COLORS[unit.hostility] ?? HOSTILITY_COLORS.hostile} />}
            <circle
              cx={p.x} cy={p.y} r={radiusPx} fill="none"
              stroke={ringColor} strokeWidth={selected || hovered ? 3 : 1.5}
            />
          </g>
        );
      })}
    </svg>
  );
}
