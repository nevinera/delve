// The Cells tab's cellMap with undo and redo. Each change is one step,
// except that changes with the same {group} as the change just before fold
// into its step - so a whole paint stroke, or a drag of the color picker,
// undoes at once. Starts over when resetKey
// changes (another map).
import {useCallback, useState} from "react";
import {CellMapDraft} from "./CellMapDraft";

const LIMIT = 100;

export function useCellHistory(initial, resetKey) {
  const start = () => ({key: resetKey, past: [], present: initial ? new CellMapDraft(initial) : null, future: [], group: null});
  const [state, setState] = useState(start);
  const current = state.key === resetKey ? state : start();
  if (current !== state) setState(current);

  const change = useCallback((fn, {group = null} = {}) => {
    setState((s) => {
      const next = fn(s.present);
      if (next === s.present) return s;
      const merge = group !== null && group === s.group;
      const past = merge || !s.present ? s.past : [...s.past, s.present].slice(-LIMIT);
      return {...s, past, present: next, future: [], group};
    });
  }, []);
  const undo = useCallback(() => {
    setState((s) => (s.past.length ? {...s, past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future], group: null} : s));
  }, []);
  const redo = useCallback(() => {
    setState((s) => (s.future.length ? {...s, past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1), group: null} : s));
  }, []);

  return {draft: current.present, change, undo, redo, canUndo: current.past.length > 0, canRedo: current.future.length > 0};
}
