// Undo and redo for the Cells tab. The map file holds the cellMap; this
// keeps the steps around it, and sends every change (including undo and
// redo) through onChange(cellMap). Each change is one step, except that
// changes with the same {group} as the change just before fold into its
// step - so a whole paint stroke, or a drag of the color picker, undoes at
// once. Starts over when resetKey changes (another map).
import {useCallback, useMemo, useReducer, useRef} from "react";
import {CellMapDraft} from "./CellMapDraft";

const LIMIT = 100;

const fresh = (key) => ({key, past: [], future: [], group: null, edits: 0});

export function useCellHistory(cellMap, onChange, resetKey) {
  const [, rerender] = useReducer((n) => n + 1, 0);
  const stacks = useRef(fresh(resetKey));
  if (stacks.current.key !== resetKey) stacks.current = fresh(resetKey);

  // The latest cellMap, including changes sent but not yet rendered back,
  // so changes in quick succession build on each other.
  const latest = useRef(cellMap);
  const seen = useRef(cellMap);
  if (seen.current !== cellMap) {
    seen.current = cellMap;
    latest.current = cellMap;
  }
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const apply = useCallback((next, stackChanges) => {
    latest.current = next;
    stacks.current = {...stacks.current, ...stackChanges, edits: stacks.current.edits + 1};
    onChangeRef.current(next);
    rerender();
  }, []);

  const change = useCallback((fn, {group = null} = {}) => {
    const before = latest.current;
    const next = fn(before ? new CellMapDraft(before) : null);
    if (!next || next.data === before) return;
    const s = stacks.current;
    const merge = group !== null && group === s.group;
    apply(next.data, {past: merge || !before ? s.past : [...s.past, before].slice(-LIMIT), future: [], group});
  }, [apply]);

  const undo = useCallback(() => {
    const s = stacks.current;
    if (!s.past.length) return;
    apply(s.past[s.past.length - 1], {past: s.past.slice(0, -1), future: [latest.current, ...s.future], group: null});
  }, [apply]);

  const redo = useCallback(() => {
    const s = stacks.current;
    if (!s.future.length) return;
    apply(s.future[0], {past: [...s.past, latest.current], future: s.future.slice(1), group: null});
  }, [apply]);

  const draft = useMemo(() => (cellMap ? new CellMapDraft(cellMap) : null), [cellMap]);
  return {
    draft, change, undo, redo,
    canUndo: stacks.current.past.length > 0, canRedo: stacks.current.future.length > 0,
    // Changes made here since the map opened - none means nothing to save.
    edits: stacks.current.edits,
  };
}
