// The "?" popup listing the map editor's hotkeys (see MapEditor.jsx's own
// keydown effect for B/C/L/P/?, and MapCanvas.jsx's for WASD/+/-) - a plain
// centered overlay, no existing modal component in this codebase to reuse.
// Escape (handled by MapEditor's effect) is the only way to close it - no
// backdrop click, since that's consistent with every other "armed mode"
// cancel gesture here.
const HOTKEYS = [
  {key: "W A S D", label: "Pan the map"},
  {key: "+ / -", label: "Zoom in/out"},
  {key: "B", label: "New line barrier"},
  {key: "C", label: "New circle barrier"},
  {key: "L", label: "New line connection"},
  {key: "P", label: "New point connection"},
  {key: "?", label: "Show this help"},
];

export default function HotkeyHelp() {
  return (
    <div className="map-hotkey-help-backdrop">
      <div className="map-hotkey-help">
        <h3>Hotkeys</h3>
        <table>
          <tbody>
            {HOTKEYS.map(({key, label}) => (
              <tr key={key}>
                <td><kbd>{key}</kbd></td>
                <td>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="map-hotkey-help-hint">Esc to close</p>
      </div>
    </div>
  );
}
