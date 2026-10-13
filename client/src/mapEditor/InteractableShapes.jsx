import {feetToPixel, feetSpacingToPixelsX, feetSpacingToPixelsY} from "./mapCoords";
import {stampFor, stampFrame} from "../game/stamps";
import {stampBox} from "./stamps/stampGeometry";

// Quest interactables (docs/schema/map.md#interactable): each its stamp at
// its true size, centered on its position and turned by its angle (north
// up, clockwise, as the game draws it), with a dashed outline so one with
// no stamp yet - or a faint one - can still be found and dragged.
// stampLayer {sets, sheets} is the zone's stamps and their loaded sheets.
const OUTLINE = "#c9a2ff";
const SELECTED_OUTLINE = "#ffb0b0";
const HOVER_OUTLINE = "#fff";
// The size of one whose stamp can't be drawn (none picked, or not loaded).
const PLACEHOLDER_FEET = {width: 3, height: 3};

const lookOf = (interactable) => ({stamp: interactable.stamp, variant: interactable.variant ?? 0, scale: interactable.scale, x: 0, y: 0});

// An interactable's size in feet, from its stamp.
export function interactableFeet(interactable, stampLayer) {
  return (stampLayer && stampBox(stampLayer.sets, stampLayer.sheets, lookOf(interactable))) ?? PLACEHOLDER_FEET;
}

export default function InteractableShapes({
  interactables, pixelDimensions, feetDimensions, stampLayer = null, interactive, selectedIndex, hoveredIndex, onStartDrag, onHover,
}) {
  return (
    <svg className="map-canvas-shapes" width={pixelDimensions.width} height={pixelDimensions.height}>
      {interactables.map((interactable, i) => {
        const p = feetToPixel(interactable.position.x, interactable.position.y, pixelDimensions, feetDimensions);
        const feet = interactableFeet(interactable, stampLayer);
        const w = feetSpacingToPixelsX(feet.width, pixelDimensions, feetDimensions);
        const h = feetSpacingToPixelsY(feet.height, pixelDimensions, feetDimensions);
        const found = stampLayer && stampFor(stampLayer.sets, lookOf(interactable));
        const sheet = found && stampLayer.sheets[found.set];
        const frame = sheet && stampFrame(found.stamp, lookOf(interactable), sheet);
        const selected = interactive && selectedIndex === i;
        const stroke = selected ? SELECTED_OUTLINE : hoveredIndex === i ? HOVER_OUTLINE : OUTLINE;
        return (
          <g
            key={i} data-interactable={i}
            transform={`translate(${p.x} ${p.y}) rotate(${interactable.position.angle ?? 0})`}
            onPointerDown={interactive ? (e) => onStartDrag(i, e) : undefined}
            onPointerEnter={() => onHover?.(i)}
            onPointerLeave={() => onHover?.(null)}
          >
            {frame && (
              <svg x={-w / 2} y={-h / 2} width={w} height={h} viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`} preserveAspectRatio="none">
                <image href={sheet.src} width={sheet.naturalWidth} height={sheet.naturalHeight} />
              </svg>
            )}
            <rect
              x={-w / 2} y={-h / 2} width={w} height={h} fill={frame ? "none" : "rgba(201, 162, 255, 0.25)"}
              stroke={stroke} strokeWidth={Math.max(1, Math.min(w, h) * (selected ? 0.08 : 0.04))} strokeDasharray={`${Math.max(2, w * 0.1)}`}
            />
          </g>
        );
      })}
    </svg>
  );
}
