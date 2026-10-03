import {useEffect, useRef, useState} from "react";

// Picks an image by showing it: the current one as a button, opening a
// grid of the available images, plus "Upload…" (when onUpload is given)
// and "Clear". value is whatever the host stores (e.g. a path relative to
// the map file); options are [{value, label, url}], url displayable.
// onUpload(file) returns (or resolves to) the value for the stored upload.
export default function ImagePicker({label, value, url, options = [], onChange, onUpload}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function pick(next) {
    onChange(next);
    setOpen(false);
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) pick(await onUpload(file));
  }

  return (
    <div className="image-picker" ref={rootRef}>
      <button type="button" className="image-picker-current" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {url ? <img src={url} alt="" /> : <span className="image-picker-empty" />}
        <span className="image-picker-name">{value ? value.split("/").pop() : "None"}</span>
      </button>
      {open && (
        <div className="image-picker-popover" role="dialog" aria-label={`Choose ${label}`}>
          {options.length === 0
            ? <p className="map-sidebar-hint">No images in this world yet.</p>
            : (
              <div className="image-picker-grid">
                {options.map((option) => (
                  <button
                    key={option.value} type="button" title={option.label} aria-label={option.label} aria-pressed={option.value === value}
                    className={`image-picker-option${option.value === value ? " selected" : ""}`}
                    onClick={() => pick(option.value)}
                  >
                    <img src={option.url} alt="" />
                  </button>
                ))}
              </div>
            )}
          <div className="image-picker-actions">
            {onUpload && (
              <>
                <button type="button" onClick={() => inputRef.current?.click()}>Upload…</button>
                <input ref={inputRef} type="file" accept="image/*" hidden aria-label={`Upload ${label}`} onChange={upload} />
              </>
            )}
            {value && <button type="button" onClick={() => pick(undefined)}>Clear</button>}
          </div>
        </div>
      )}
    </div>
  );
}
