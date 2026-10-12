import {feetToPixel, feetSpacingToPixelsX, feetSpacingToPixelsY} from "./mapCoords";

// Quest interactables (docs/schema/map.md#interactable): each its image at
// its true size, centered on its position and turned by its angle (north
// up, clockwise, as the game draws it), with a dashed outline so one with
// no image yet - or a faint one - can still be found and dragged.
// imageUrls maps a raw imageUrl to a displayable one.
const OUTLINE = "#c9a2ff";
const SELECTED_OUTLINE = "#ffb0b0";
const HOVER_OUTLINE = "#fff";

export default function InteractableShapes({
  interactables, pixelDimensions, feetDimensions, imageUrls = {}, interactive, selectedIndex, hoveredIndex, onStartDrag, onHover,
}) {
  return (
    <svg className="map-canvas-shapes" width={pixelDimensions.width} height={pixelDimensions.height}>
      {interactables.map((interactable, i) => {
        const p = feetToPixel(interactable.position.x, interactable.position.y, pixelDimensions, feetDimensions);
        const w = feetSpacingToPixelsX(interactable.size?.width ?? 1, pixelDimensions, feetDimensions);
        const h = feetSpacingToPixelsY(interactable.size?.height ?? 1, pixelDimensions, feetDimensions);
        const url = imageUrls[interactable.imageUrl];
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
            {url && <image href={url} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="none" />}
            <rect
              x={-w / 2} y={-h / 2} width={w} height={h} fill={url ? "none" : "rgba(201, 162, 255, 0.25)"}
              stroke={stroke} strokeWidth={Math.max(1, Math.min(w, h) * (selected ? 0.08 : 0.04))} strokeDasharray={`${Math.max(2, w * 0.1)}`}
            />
          </g>
        );
      })}
    </svg>
  );
}
