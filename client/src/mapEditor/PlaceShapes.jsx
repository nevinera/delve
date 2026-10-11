import {feetToPixel} from "./mapCoords";

// The map's places (see docs/schema/map.md#place), drawn on the Places tab:
// each outline tinted its own color, with its name (or identifier) at its
// middle. Read-only; clicking a place selects it (opening it in the list).
// Where places nest, the smaller is drawn last, over the bigger.

export function placeColor(index, alpha) {
  return `hsla(${(index * 137.5) % 360}, 70%, 60%, ${alpha})`;
}

function area(polygon) {
  return Math.abs(polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0)) / 2;
}

// The polygon's centroid, or its points' average if it has no area.
function middle(polygon) {
  let [cx, cy, twice] = [0, 0, 0];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
    twice += cross;
  });
  if (Math.abs(twice) < 1e-9) return {x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length, y: polygon.reduce((s, p) => s + p.y, 0) / polygon.length};
  return {x: cx / (3 * twice), y: cy / (3 * twice)};
}

export default function PlaceShapes({places, pixelDimensions, feetDimensions, selectedIndex, hoveredIndex, onSelect}) {
  const toPixel = ({x, y}) => feetToPixel(x, y, pixelDimensions, feetDimensions);
  const order = places.map((place, i) => ({place, i, size: area(place.polygon)})).sort((a, b) => b.size - a.size);

  return (
    <svg className="map-canvas-shapes map-canvas-places" width={pixelDimensions.width} height={pixelDimensions.height}>
      {order.map(({place, i}) => {
        const lit = i === selectedIndex || i === hoveredIndex;
        const d = "M" + place.polygon.map((p) => { const {x, y} = toPixel(p); return `${x},${y}`; }).join("L") + "Z";
        return (
          <path
            key={place.identifier} data-testid="map-place" d={d}
            fill={placeColor(i, lit ? 0.4 : 0.18)} stroke={placeColor(i, 0.9)} strokeWidth={lit ? 3 : 1.5}
            style={{cursor: "pointer"}}
            onClick={(e) => { e.stopPropagation(); onSelect(i); }}
          />
        );
      })}
      {places.map((place, i) => {
        const {x, y} = toPixel(middle(place.polygon));
        return (
          <text key={`label-${place.identifier}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="map-place-label" pointerEvents="none">
            {place.name ?? place.identifier}
          </text>
        );
      })}
    </svg>
  );
}
