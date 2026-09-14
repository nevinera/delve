// Barriers are created by clicking on the canvas (Add Wall/Add Circle tools
// in MapCanvas's toolbar) - there's nothing useful to "+ Add" from here
// without a position, unlike every other editor's entry lists. This panel
// is purely for viewing/precise-editing/removing what's already there,
// synced with canvas selection (see MapEditor's selectedBarrierIndex).

function NumberField({value, onChange}) {
  return (
    <input
      type="number" step="any" value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
    />
  );
}

function WallPoints({locations, onChange}) {
  function updatePoint(index, axis, value) {
    onChange(locations.map((loc, i) => (i === index ? {...loc, [axis]: value} : loc)));
  }

  function removePoint(index) {
    onChange(locations.filter((_, i) => i !== index));
  }

  return (
    <table>
      <tbody>
        {locations.map((loc, i) => (
          <tr key={i}>
            <th>Point {i + 1}</th>
            <td className="map-fields-dimension-pair">
              <NumberField value={loc.x} onChange={(v) => updatePoint(i, "x", v)} />
              <span>,</span>
              <NumberField value={loc.y} onChange={(v) => updatePoint(i, "y", v)} />
              {locations.length > 2 && (
                <button type="button" className="remove-entry" onClick={() => removePoint(i)}>×</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CircleFields({barrier, onChange}) {
  return (
    <table>
      <tbody>
        <tr>
          <th>Center</th>
          <td className="map-fields-dimension-pair">
            <NumberField value={barrier.location?.x} onChange={(v) => onChange({...barrier, location: {...barrier.location, x: v}})} />
            <span>,</span>
            <NumberField value={barrier.location?.y} onChange={(v) => onChange({...barrier, location: {...barrier.location, y: v}})} />
          </td>
        </tr>
        <tr>
          <th>Radius</th>
          <td><NumberField value={barrier.radius} onChange={(v) => onChange({...barrier, radius: v})} /></td>
        </tr>
      </tbody>
    </table>
  );
}

export default function BarriersPanel({barriers, selectedIndex, onSelect, dispatch}) {
  if (barriers.length === 0) {
    return <p className="map-editor-sidebar-placeholder">No barriers yet - use the Add Wall / Add Circle tools on the canvas.</p>;
  }

  function updateBarrier(index, nextBarrier) {
    Object.entries(nextBarrier).forEach(([field, value]) => {
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "barriers", index, field, value});
    });
  }

  function removeBarrier(index) {
    dispatch({type: "REMOVE_ENTRY", section: "barriers", index});
    if (selectedIndex === index) onSelect(null);
  }

  return (
    <>
      <h3>Barriers</h3>
      {barriers.map((barrier, i) => (
        <div
          key={i}
          className={`entry-block${selectedIndex === i ? " map-entry-selected" : ""}`}
          onClick={() => onSelect(i)}
        >
          <div className="entry-heading-row">
            <h3>Barrier {i + 1}: {barrier.type}</h3>
            <button type="button" className="remove-entry" onClick={(e) => { e.stopPropagation(); removeBarrier(i); }}>
              Remove
            </button>
          </div>
          {barrier.type === "wall"
            ? <WallPoints locations={barrier.locations} onChange={(locations) => updateBarrier(i, {locations})} />
            : <CircleFields barrier={barrier} onChange={(next) => updateBarrier(i, next)} />}
        </div>
      ))}
    </>
  );
}
