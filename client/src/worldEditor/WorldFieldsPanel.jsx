function TextField({value, onChange, placeholder}) {
  return <input type="text" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

function IntField({value, onChange}) {
  return (
    <input
      type="number" step="1" value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
    />
  );
}

// elevationRange is a single optional [min, max] array (see
// docs/schema/world.md) - clearing both sides omits the field entirely
// rather than saving a half-filled range.
function ElevationRangeField({value, onChange}) {
  const [min, max] = value ?? [null, null];

  function update(nextMin, nextMax) {
    if (nextMin === null && nextMax === null) {
      onChange(null);
    } else {
      onChange([nextMin, nextMax]);
    }
  }

  return (
    <div className="range-field">
      <IntField value={min} onChange={(v) => update(v, max)} />
      <span className="range-sep">to</span>
      <IntField value={max} onChange={(v) => update(min, v)} />
    </div>
  );
}

// Top-level World fields only - zones/worldLinks/entryPoints each get their
// own panel below (see WorldEditor.jsx).
export default function WorldFieldsPanel({draft, onChange}) {
  const {data} = draft;

  return (
    <table>
      <tbody>
        <tr>
          <th>Name</th>
          <td><TextField value={data.name} onChange={(v) => onChange(draft.setField("name", v))} placeholder="Northern Barrens" /></td>
        </tr>
        <tr>
          <th>Description</th>
          <td><TextField value={data.description} onChange={(v) => onChange(draft.setField("description", v))} /></td>
        </tr>
        <tr>
          <th>Thumbnail URL</th>
          <td><TextField value={data.thumbnailUrl} onChange={(v) => onChange(draft.setField("thumbnailUrl", v))} placeholder="../../assets/worlds/northern-barrens-thumb.webp" /></td>
        </tr>
        <tr>
          <th>Elevation Range</th>
          <td><ElevationRangeField value={data.elevationRange} onChange={(v) => onChange(draft.setField("elevationRange", v))} /></td>
        </tr>
      </tbody>
    </table>
  );
}
