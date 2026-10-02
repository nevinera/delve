import {assetOverrideKey} from "./resolveAbilityForPlayback";

// Removing an entry shifts every later entry's index down by one, so any
// value keyed by section+index (see assetOverrideKey) needs to move with
// it - used for both the preview-URL map and the pending-File map, which
// share the same keys. Drops (rather than shifts) the entry that was
// actually removed.
export function reindexBySection(map, section, removedIndex, onRemoved) {
  const prefix = `${section}[`;
  const next = {};
  for (const [key, value] of Object.entries(map)) {
    if (!key.startsWith(prefix)) {
      next[key] = value;
      continue;
    }
    const [, entryIndex, field] = key.match(/^(?:.+)\[(\d+)\]\.(.+)$/);
    const i = Number(entryIndex);
    if (i === removedIndex) {
      onRemoved?.(value);
      continue;
    }
    next[assetOverrideKey(section, i > removedIndex ? i - 1 : i, field)] = value;
  }
  return next;
}
