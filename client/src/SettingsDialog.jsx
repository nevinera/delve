import { useEffect, useState } from "react";
import { ABILITY_BUTTON_COUNT } from "./abilityButtons";

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
export const JOYSTICK_SENSITIVITY_MIN = 0.25;
export const JOYSTICK_SENSITIVITY_MAX = 3;
export const JOYSTICK_SENSITIVITY_STEP = 0.25;

function JoystickPane({ value, onChange, error }) {
  return (
    <>
      <label style={styles.row}>
        <span>Camera stick</span>
        <input
          type="range"
          aria-label="Joystick sensitivity"
          style={{ flex: 1 }}
          min={JOYSTICK_SENSITIVITY_MIN}
          max={JOYSTICK_SENSITIVITY_MAX}
          step={JOYSTICK_SENSITIVITY_STEP}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span>{value.toFixed(2)}x</span>
      </label>
      <div style={{ marginTop: 8 }}>
        <button type="button" style={styles.button} onClick={() => onChange(1)}>Reset to default</button>
      </div>
      {error && <div style={styles.error}>{error}</div>}
    </>
  );
}

export default function SettingsDialog({
  open, powers, layout, onAssign, onReset, onToggleLatency, onReload, onClose, error,
  showJoystickSettings = false, joystickSensitivity = 1, onJoystickSensitivityChange,
}) {
  const [pane, setPane] = useState(null);
  useEffect(() => { if (!open) setPane(null); }, [open]);
  if (!open) return null;

  const title = { abilities: "Remap abilities", joystick: "Joystick sensitivity" }[pane] ?? "Settings";
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
        ) : pane === "joystick" ? (
          <JoystickPane value={joystickSensitivity} onChange={onJoystickSensitivityChange} error={error} />
        ) : (
          <div style={styles.menu}>
            <button type="button" style={styles.menuButton} onClick={() => setPane("abilities")}>
              Remap abilities
            </button>
            {showJoystickSettings && (
              <button type="button" style={styles.menuButton} onClick={() => setPane("joystick")}>
                Joystick sensitivity
              </button>
            )}
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
