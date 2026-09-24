// Edits a unit's `dialogue` (docs/schema/unit.md): an ordered list of lines
// a player clicks through. An emptied list is written as undefined so the
// field drops out of the saved JSON.
export default function DialogueFields({lines = [], onChange}) {
  function write(next) {
    onChange(next.length ? next : undefined);
  }

  function setLine(i, text) {
    write(lines.map((line, j) => (j === i ? text : line)));
  }

  function move(i, delta) {
    const next = [...lines];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    write(next);
  }

  return (
    <div className="map-unit-dialogue">
      <h4>Dialogue</h4>
      {lines.length === 0 && <p className="map-editor-sidebar-placeholder">No dialogue yet.</p>}
      {lines.map((line, i) => (
        <div key={i} className="map-dialogue-line">
          <textarea
            rows={2} value={line} aria-label={`Dialogue line ${i + 1}`}
            onChange={(e) => setLine(i, e.target.value)}
          />
          <div className="map-dialogue-line-buttons">
            <button type="button" aria-label={`Move line ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button type="button" aria-label={`Move line ${i + 1} down`} disabled={i === lines.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => write(lines.filter((_, j) => j !== i))}>×</button>
          </div>
        </div>
      ))}
      <div className="add-buttons-row">
        <button type="button" className="add-entry" onClick={() => write([...lines, ""])}>+ Add Line</button>
      </div>
    </div>
  );
}
