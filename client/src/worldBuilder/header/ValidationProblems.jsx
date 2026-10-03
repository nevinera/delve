import {useEffect, useRef, useState} from "react";

// The last Validate's problems, behind a compact header button that opens
// a popover - each problem a link to where in the editor it is. Opens on
// its own when a Validate turns up problems; closes on Escape, a click
// outside, or picking a problem. Shown only while the problems still
// describe the current draft.
export default function ValidationProblems({problems, onSelect}) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    setOpen(Boolean(problems?.length));
  }, [problems]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onPointer = (e) => root.current && !root.current.contains(e.target) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (!problems?.length) return null;
  const label = `${problems.length} problem${problems.length === 1 ? "" : "s"}`;

  return (
    <div className="validation-problems" ref={root}>
      <button type="button" className="validation-problems-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⚠ {label}</button>
      {open && (
        <div className="validation-problems-popover" role="dialog" aria-label="Validation problems">
          <ul>
            {problems.map((problem, i) => (
              <li key={i}>
                <button type="button" className="crumb-link" onClick={() => {
                  setOpen(false);
                  onSelect(problem.location);
                }}>{problem.file}</button>
                <span className="validation-problem-message">{problem.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
