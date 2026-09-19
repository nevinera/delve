import { useEffect, useState } from "react";
import { ABILITY_BUTTON_COUNT } from "./abilityButtons";
import { ACTIONS, DEFAULT_HOTKEYS, bindingFromEvent, bindingLabel, duplicateBindings } from "./hotkeys";

const styles = {
  backdrop: {
    position: "fixed", inset: 0, zIndex: 2000, display: "flex",
    alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)",
  },
  dialog: {
    background: "#1a1a1a", border: "1px solid #555", borderRadius: 6, color: "#eee",
    padding: 16, width: 320, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto",
    fontSize: 13,
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0", gap: 8 },
  select: { flex: 1, maxWidth: 200, background: "#111", color: "#eee", border: "1px solid #444", borderRadius: 4, padding: 4 },
  button: { background: "#1c1c1c", border: "1px solid #444", borderRadius: 4, color: "#eee", padding: "4px 10px", cursor: "pointer" },
  menu: { display: "flex", flexDirection: "column", gap: 6 },
  menuButton: { background: "#1c1c1c", border: "1px solid #444", borderRadius: 4, color: "#eee", padding: "8px 10px", cursor: "pointer" },
  error: { color: "#ff6666", marginTop: 8 },
};

function RemapAbilitiesPane({ powers, layout, onAssign, onReset, error }) {
  return (
    <>
      {Array.from({ length: ABILITY_BUTTON_COUNT }, (_, button) => (
        <label key={button} style={styles.row}>
          <span>{button === 9 ? "Button 0" : `Button ${button + 1}`}</span>
          <select
            style={styles.select}
            value={layout[button]}
            onChange={(e) => onAssign(button, Number(e.target.value))}
          >
            {Array.from({ length: ABILITY_BUTTON_COUNT }, (_, p) => (
              <option key={p} value={p}>{powers[p]?.name ?? "(empty)"}</option>
            ))}
          </select>
        </label>
      ))}
      <div style={{ marginTop: 8 }}>
        <button type="button" style={styles.button} onClick={onReset}>Reset to default</button>
      </div>
      {error && <div style={styles.error}>{error}</div>}
    </>
  );
}

// In-game settings: a menu of panes. The pane replaces the menu in the same
// dialog, with a Back button to return; it also holds the latency toggle and
// reload actions. Panes so far: remap abilities (one
// select per action bar button choosing which power sits there; picking a
// power already on another button swaps the two).
// Edits a draft of the bindings; nothing applies until Save, which is blocked
// while two actions share a key. Click an action, then press the key to bind
// (so only keys the browser actually delivers can be chosen); Escape cancels
// the capture.
function HotkeysPane({ hotkeys, onSave, onSaved }) {
  const [draft, setDraft] = useState(hotkeys);
  const [capturing, setCapturing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (!capturing) return undefined;
    // Capture phase + stopImmediatePropagation: the game's own key handler
    // must not also react to the key being bound (or to Escape).
    const onKeyDown = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === "Escape") { setCapturing(null); return; }
      const binding = bindingFromEvent(e);
      if (!binding) return; // a lone modifier or a key we can't bind: keep waiting
      setDraft((d) => ({ ...d, [capturing]: binding }));
      setCapturing(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing]);

  const duplicates = duplicateBindings(draft);
  const conflictsWith = (id) => (duplicates[draft[id]] ?? []).filter((other) => other !== id);
  const changed = ACTIONS.some(({ id }) => draft[id] !== hotkeys[id]);
  const blocked = Object.keys(duplicates).length > 0;

  async function save() {
    setSaving(true);
    setSaveError(null);
    const error = await onSave(draft);
    setSaving(false);
    if (error) setSaveError(error); else onSaved();
  }

  return (
    <>
      {ACTIONS.map(({ id, label }) => {
        const others = conflictsWith(id);
        return (
          <div key={id} style={styles.row}>
            <span>{label}</span>
            <span>
              {others.length > 0 && <span style={{ ...styles.error, marginRight: 6 }}>also {others.join(", ")}</span>}
              <button
                type="button"
                aria-label={`Bind ${label}`}
                style={{ ...styles.button, minWidth: 90, ...(capturing === id ? { borderColor: "#ffcc00" } : {}) }}
                onClick={() => setCapturing(capturing === id ? null : id)}
              >
                {capturing === id ? "Press a key..." : bindingLabel(draft[id])}
              </button>
            </span>
          </div>
        );
      })}
      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
        <button type="button" style={styles.button} disabled={!changed || blocked || saving} onClick={save}>Save</button>
        <button type="button" style={styles.button} onClick={() => { setCapturing(null); setDraft({ ...DEFAULT_HOTKEYS }); }}>
          Reset to default
        </button>
      </div>
      {blocked && <div style={styles.error}>Each action needs its own key.</div>}
      {saveError && <div style={styles.error}>{saveError}</div>}
    </>
  );
}

export const CAMERA_SENSITIVITY_MIN = 0.5;
export const CAMERA_SENSITIVITY_MAX = 2;

// The slider is logarithmic (position -1..1 maps to 0.5x..2x) so the default
// 1x sits exactly in the middle.
export const sensitivityToSlider = (value) =>
  Math.log2(Math.min(CAMERA_SENSITIVITY_MAX, Math.max(CAMERA_SENSITIVITY_MIN, value)));
export const sliderToSensitivity = (position) => Math.round(2 ** position * 100) / 100;

function CameraPane({ value, onChange, error }) {
  return (
    <>
      <label style={styles.row}>
        <span>Camera</span>
        <input
          type="range"
          aria-label="Camera sensitivity"
          style={{ flex: 1 }}
          min={-1}
          max={1}
          step={0.05}
          value={sensitivityToSlider(value)}
          onChange={(e) => onChange(sliderToSensitivity(Number(e.target.value)))}
        />
        <span>{value.toFixed(2)}x</span>
      </label>
      <div style={{ color: "#aaa", marginTop: 6 }}>Applies to mouse/touch drag and the camera stick.</div>
      <div style={{ marginTop: 8 }}>
        <button type="button" style={styles.button} onClick={() => onChange(1)}>Reset to default</button>
      </div>
      {error && <div style={styles.error}>{error}</div>}
    </>
  );
}

export default function SettingsDialog({
  open, powers, layout, onAssign, onReset, onToggleLatency, onReload, onClose, error,
  cameraSensitivity = 1, onCameraSensitivityChange, hotkeys = DEFAULT_HOTKEYS, onSaveHotkeys,
  showHotkeys = true,
}) {
  const [pane, setPane] = useState(null);
  useEffect(() => { if (!open) setPane(null); }, [open]);
  if (!open) return null;

  const title = { abilities: "Remap abilities", camera: "Camera sensitivity", hotkeys: "Hotkeys" }[pane] ?? "Settings";
  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.dialog} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <strong>{title}</strong>
          <span>
            {pane && <button type="button" style={{ ...styles.button, marginRight: 6 }} onClick={() => setPane(null)}>Back</button>}
            <button type="button" style={styles.button} onClick={onClose}>Close</button>
          </span>
        </div>
        {pane === "abilities" ? (
          <RemapAbilitiesPane powers={powers} layout={layout} onAssign={onAssign} onReset={onReset} error={error} />
        ) : pane === "hotkeys" ? (
          <HotkeysPane hotkeys={hotkeys} onSave={onSaveHotkeys} onSaved={() => setPane(null)} />
        ) : pane === "camera" ? (
          <CameraPane value={cameraSensitivity} onChange={onCameraSensitivityChange} error={error} />
        ) : (
          <div style={styles.menu}>
            <button type="button" style={styles.menuButton} onClick={() => setPane("abilities")}>
              Remap abilities
            </button>
            {showHotkeys && (
              <button type="button" style={styles.menuButton} onClick={() => setPane("hotkeys")}>
                Hotkeys
              </button>
            )}
            <button type="button" style={styles.menuButton} onClick={() => setPane("camera")}>
              Camera sensitivity
            </button>
            <button type="button" style={styles.menuButton} onClick={onToggleLatency}>
              Toggle latency display (L)
            </button>
            <button type="button" style={styles.menuButton} onClick={onReload}>
              Reload
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
