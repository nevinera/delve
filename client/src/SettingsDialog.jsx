import { useEffect, useState } from "react";
import { ABILITY_BUTTON_COUNT } from "./abilityButtons";
import { ACTIONS, DEFAULT_HOTKEYS, bindingFromEvent, bindingLabel, duplicateBindings } from "./hotkeys";

function RemapAbilitiesPane({ powers, layout, onAssign, onReset, error }) {
  return (
    <>
      {Array.from({ length: ABILITY_BUTTON_COUNT }, (_, button) => (
        <label key={button} className="game-settings-row">
          <span>{button === 9 ? "Button 0" : `Button ${button + 1}`}</span>
          <select
            className="game-settings-select"
            value={layout[button]}
            onChange={(e) => onAssign(button, Number(e.target.value))}
          >
            {Array.from({ length: ABILITY_BUTTON_COUNT }, (_, p) => (
              <option key={p} value={p}>{powers[p]?.name ?? "(empty)"}</option>
            ))}
          </select>
        </label>
      ))}
      <div className="game-settings-actions">
        <button type="button" className="game-settings-button" onClick={onReset}>Reset to default</button>
      </div>
      {error && <div className="game-settings-error">{error}</div>}
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
          <div key={id} className="game-settings-row">
            <span>{label}</span>
            <span>
              {others.length > 0 && <span className="game-settings-conflict">also {others.join(", ")}</span>}
              <button
                type="button"
                aria-label={`Bind ${label}`}
                className={capturing === id ? "game-settings-button game-settings-binding game-settings-binding-capturing" : "game-settings-button game-settings-binding"}
                onClick={() => setCapturing(capturing === id ? null : id)}
              >
                {capturing === id ? "Press a key..." : bindingLabel(draft[id])}
              </button>
            </span>
          </div>
        );
      })}
      <div className="game-settings-actions">
        <button type="button" className="game-settings-button" disabled={!changed || blocked || saving} onClick={save}>Save</button>
        <button type="button" className="game-settings-button" onClick={() => { setCapturing(null); setDraft({ ...DEFAULT_HOTKEYS }); }}>
          Reset to default
        </button>
      </div>
      {blocked && <div className="game-settings-error">Each action needs its own key.</div>}
      {saveError && <div className="game-settings-error">{saveError}</div>}
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
      <label className="game-settings-row">
        <span>Camera</span>
        <input
          type="range"
          aria-label="Camera sensitivity"
          min={-1}
          max={1}
          step={0.05}
          value={sensitivityToSlider(value)}
          onChange={(e) => onChange(sliderToSensitivity(Number(e.target.value)))}
        />
        <span>{value.toFixed(2)}x</span>
      </label>
      <div className="game-settings-note">Applies to mouse/touch drag and the camera stick.</div>
      <div className="game-settings-actions">
        <button type="button" className="game-settings-button" onClick={() => onChange(1)}>Reset to default</button>
      </div>
      {error && <div className="game-settings-error">{error}</div>}
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
    <div className="game-settings-backdrop" onClick={onClose}>
      <div className="game-settings" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="game-settings-header">
          <strong>{title}</strong>
          <span>
            {pane && <button type="button" className="game-settings-button" onClick={() => setPane(null)}>Back</button>}
            <button type="button" className="game-settings-button" onClick={onClose}>Close</button>
          </span>
        </div>
        {pane === "abilities" ? (
          <RemapAbilitiesPane powers={powers} layout={layout} onAssign={onAssign} onReset={onReset} error={error} />
        ) : pane === "hotkeys" ? (
          <HotkeysPane hotkeys={hotkeys} onSave={onSaveHotkeys} onSaved={() => setPane(null)} />
        ) : pane === "camera" ? (
          <CameraPane value={cameraSensitivity} onChange={onCameraSensitivityChange} error={error} />
        ) : (
          <div className="game-settings-menu">
            <button type="button" className="game-settings-button" onClick={() => setPane("abilities")}>
              Remap abilities
            </button>
            {showHotkeys && (
              <button type="button" className="game-settings-button" onClick={() => setPane("hotkeys")}>
                Hotkeys
              </button>
            )}
            <button type="button" className="game-settings-button" onClick={() => setPane("camera")}>
              Camera sensitivity
            </button>
            <button type="button" className="game-settings-button" onClick={onToggleLatency}>
              Toggle latency display (L)
            </button>
            <button type="button" className="game-settings-button" onClick={onReload}>
              Reload
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
