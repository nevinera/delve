// Renders the Cells tab's cellMap a moment after it stops changing, in the
// worker (see cellMap/cache.js), keeping the last good render on screen
// meanwhile. Previews aren't stored in IndexedDB: they're short-lived.
import {useEffect, useState} from "react";
import {cachedCellMapImage} from "../../cellMap/cache";
import {validateCellMap} from "../../cellMap/format";

const DEBOUNCE_MS = 150;

// layers renders the tree crowns apart (render.canopy), to draw over
// decoration stamps.
export function useCellMapRender(cellMap, pixelsPerFoot, {layers = false} = {}) {
  const [result, setResult] = useState(null);
  const errors = cellMap ? validateCellMap(cellMap) : [];
  const key = cellMap && !errors.length ? JSON.stringify(cellMap) : null;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      const started = performance.now();
      cachedCellMapImage(cellMap, {pixelsPerFoot, persist: false, layers}).then(({image, canopy, timings}) => {
        if (!cancelled) setResult({image, canopy, cellMap, timings, total: performance.now() - started});
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, pixelsPerFoot, layers]); // eslint-disable-line react-hooks/exhaustive-deps

  return {render: key ? result : null, errors, pending: Boolean(key) && result?.cellMap !== cellMap};
}
