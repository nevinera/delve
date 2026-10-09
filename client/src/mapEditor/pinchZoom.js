// Two-finger pinch on the map canvas. Positions are wrapper-relative
// pixels; offset/zoom are MapCanvas's own pan/zoom.

export function pinchSpan(a, b) {
  return {
    distance: Math.hypot(a.x - b.x, a.y - b.y),
    midpoint: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2},
  };
}

// The view once the fingers have moved from `start` ({distance, midpoint,
// zoom, offset} when the pinch began) to `now` ({distance, midpoint}):
// zoomed by how far they've spread, keeping the map point that was under
// their starting midpoint under their current one (so it pans too).
export function pinchView(start, now, clampZoom = (zoom) => zoom) {
  const zoom = clampZoom(start.zoom * (now.distance / (start.distance || 1)));
  const anchor = {
    x: (start.midpoint.x - start.offset.x) / start.zoom,
    y: (start.midpoint.y - start.offset.y) / start.zoom,
  };
  return {zoom, offset: {x: now.midpoint.x - anchor.x * zoom, y: now.midpoint.y - anchor.y * zoom}};
}
