// Helpers for maps keyed by array index (pending uploads per power, per
// token slot), kept in step with the array they describe.

// Drops the entry at `removed`, shifting every later key down by one.
export function withoutIndex(map, removed, onRemoved) {
  const next = {};
  for (const [key, value] of Object.entries(map)) {
    const i = Number(key);
    if (i === removed) {
      onRemoved?.(value);
      continue;
    }
    next[i > removed ? i - 1 : i] = value;
  }
  return next;
}

// Swaps the entries at a and b (either may be absent).
export function swapIndices(map, a, b) {
  const next = {...map};
  delete next[a];
  delete next[b];
  if (map[a] !== undefined) next[b] = map[a];
  if (map[b] !== undefined) next[a] = map[b];
  return next;
}
