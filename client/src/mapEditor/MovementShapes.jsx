import {feetToPixel, feetSpacingToPixelsX} from "./mapCoords";

// Read-only visualization of every unit's un-aggro'd movement (see
// docs/schema/unit.md's UnitMovement). Purely decorative, same as
// GroupShapes - not part of `.map-canvas-shapes`, so it never intercepts a
// click meant for the real token/barrier/connection underneath (its own
// `.map-movement-highlight` class, not GroupShapes' `.map-group-highlight`,
// since both layers can be present at once).
//
// Both a patrol path and a wander circle render translucent by default -
// with many units on one map, several paths/zones can overlap in the same
// region, so a unit's own is drawn opaque instead whenever its token is
// hovered (on the map or via its sidebar row - same hoveredUnitIndex either
// way) or its row is expanded (being edited), so it visibly pops out from
// the rest.
const PATROL_COLOR = "#ff9800";
const PATROL_COLOR_DIM = "rgba(255, 152, 0, 0.35)";
const WANDER_FILL = "rgba(255, 152, 0, 0.18)";
const WANDER_FILL_ACTIVE = "rgba(255, 152, 0, 0.35)";
const WANDER_STROKE_DIM = "rgba(255, 152, 0, 0.35)";
const DEFAULT_TOKEN_RADIUS_FEET = 2; // used only if the unit's type is missing from availableUnitTypes

export default function MovementShapes({
  units, pixelDimensions, feetDimensions, availableUnitTypes = {}, hoveredPatrolStep,
  hoveredUnitIndex = null, expandedUnitIndices = new Set(),
}) {
  return (
    <svg className="map-movement-highlight" width={pixelDimensions.width} height={pixelDimensions.height}>
      {units.map((unit, i) => {
        const movement = unit.movement;
        const isActive = hoveredUnitIndex === i || expandedUnitIndices.has(i);

        if (movement?.type === "patrol" && movement.steps?.length > 0) {
          const points = movement.steps.map((step) => feetToPixel(step.position.x, step.position.y, pixelDimensions, feetDimensions));
          const hoveredIndex = hoveredPatrolStep?.unitIndex === i ? hoveredPatrolStep.stepIndex : null;
          const tokenRadiusFeet = availableUnitTypes[unit.unitType]?.tokenRadius ?? DEFAULT_TOKEN_RADIUS_FEET;
          const hoverRadiusPx = feetSpacingToPixelsX(tokenRadiusFeet, pixelDimensions, feetDimensions);
          const color = isActive ? PATROL_COLOR : PATROL_COLOR_DIM;
          return (
            <g key={i}>
              <polyline
                points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke={color} strokeWidth={isActive ? 4 : 3} strokeDasharray="1,6" strokeLinecap="round"
              />
              {points.map((p, pi) => <circle key={pi} cx={p.x} cy={p.y} r={4} fill={color} />)}
              {/* points[hoveredIndex] can briefly be missing right after a
                  step is removed - its pill unmounts without a mouseleave,
                  same defensive gap as BarrierShapes' hoveredPoint. */}
              {hoveredIndex !== null && points[hoveredIndex] && (
                <circle
                  cx={points[hoveredIndex].x} cy={points[hoveredIndex].y} r={hoverRadiusPx}
                  fill="rgba(255,152,0,0.3)" stroke={PATROL_COLOR} strokeWidth={2}
                />
              )}
            </g>
          );
        }

        if (movement?.type === "wander" && movement.location) {
          const center = feetToPixel(movement.location.x, movement.location.y, pixelDimensions, feetDimensions);
          const radiusPx = feetSpacingToPixelsX(movement.radius ?? 0, pixelDimensions, feetDimensions);
          return (
            <circle
              key={i} cx={center.x} cy={center.y} r={radiusPx}
              fill={isActive ? WANDER_FILL_ACTIVE : WANDER_FILL}
              stroke={isActive ? PATROL_COLOR : WANDER_STROKE_DIM}
              strokeWidth={isActive ? 3 : 2} strokeDasharray="5,4"
            />
          );
        }

        return null;
      })}
    </svg>
  );
}
