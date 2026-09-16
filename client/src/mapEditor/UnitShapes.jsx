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
// On a low-density map (few image-px per foot - an SVG background's
// pixelDimensions is a real example), radiusPx can be a literal handful of
// pixels, and the browser genuinely only has that many pixels of the
// portrait to work with - not a caching artifact, just too few pixels
// requested. Drawn at this fixed "local" resolution instead, then the
// whole group is scaled back down (see the <g transform> below) to land at
// exactly radiusPx in the real coordinate space - same crop/framing as
// drawing directly at radiusPx (box is still exactly 2x the clip radius,
// same ratio, just both bigger before the compensating shrink), but with
// real pixels for the browser to rasterize the portrait from.
const TOKEN_IMAGE_RASTER_PX = 256;

export default function UnitShapes({units, pixelDimensions, feetDimensions, interactive, availableUnitTypes, selectedIndex, hoveredIndex, onSelect, onStartDrag, onHoverUnit}) {
  // Only interactive (tool === "select" and no add-tool/placement of any
  // kind active - see MapCanvas's isPlacing) drags an existing unit on
  // click - otherwise a click landing on a token should fall through
  // untouched to whatever's actually armed.
  const selectable = interactive;

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
          <g
            key={i}
            onPointerDown={selectable ? (e) => onStartDrag(i, e) : undefined}
            onPointerEnter={() => onHoverUnit?.(i)}
            onPointerLeave={() => onHoverUnit?.(null)}
          >
            {info?.tokenImageUrl
              ? (
                <g transform={`translate(${p.x} ${p.y}) scale(${radiusPx / (TOKEN_IMAGE_RASTER_PX / 2)})`}>
                  <clipPath id={clipId}>
                    <circle cx={0} cy={0} r={TOKEN_IMAGE_RASTER_PX / 2} />
                  </clipPath>
                  <image
                    href={info.tokenImageUrl}
                    x={-TOKEN_IMAGE_RASTER_PX / 2} y={-TOKEN_IMAGE_RASTER_PX / 2}
                    width={TOKEN_IMAGE_RASTER_PX} height={TOKEN_IMAGE_RASTER_PX}
                    clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice"
                  />
                </g>
              )
              : <circle cx={p.x} cy={p.y} r={radiusPx} fill={HOSTILITY_COLORS[unit.hostility] ?? HOSTILITY_COLORS.hostile} />}
            {/* Proportional to the token's own radius, not a fixed pixel
                width - a low-density map (few image-px per foot, e.g. an
                SVG background whose pixelDimensions reflects its own
                modest native size) renders a small radiusPx, and a flat
                pixel stroke would swallow a disproportionate chunk of it
                once zoomed in enough to actually see the ring clearly. */}
            <circle
              cx={p.x} cy={p.y} r={radiusPx} fill="none"
              stroke={ringColor} strokeWidth={radiusPx * (selected || hovered ? 0.3 : 0.15)}
            />
          </g>
        );
      })}
    </svg>
  );
}
