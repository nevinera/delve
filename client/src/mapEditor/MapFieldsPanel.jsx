function TextField({value, onChange, placeholder}) {
  return <input type="text" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

function NumberField({value, onChange}) {
  return (
    <input
      type="number" step="any" value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
    />
  );
}

// pixelDimensions is never hand-edited - it's read straight off the loaded
// image (see MapEditor's sync effect), only feetDimensions is an authoring
// decision.
export default function MapFieldsPanel({mapData, pixelDimensions, dispatch}) {
  function setField(field, value) {
    dispatch({type: "SET_FIELD", field, value});
  }

  function setFeetDimension(axis, value) {
    const current = mapData.feetDimensions ?? {};
    setField("feetDimensions", {...current, [axis]: value});
  }

  return (
    <table>
      <tbody>
        <tr>
          <th>Identifier</th>
          <td><TextField value={mapData.identifier} onChange={(v) => setField("identifier", v)} placeholder="gc1-goblin-cave-entrance" /></td>
        </tr>
        <tr>
          <th>Name</th>
          <td><TextField value={mapData.name} onChange={(v) => setField("name", v)} placeholder="Goblin Cave Entrance" /></td>
        </tr>
        <tr>
          <th>Elevation</th>
          <td><NumberField value={mapData.elvl} onChange={(v) => setField("elvl", v)} /></td>
        </tr>
        <tr>
          <th>Pixel Dimensions</th>
          <td>
            {pixelDimensions
              ? `${pixelDimensions.width} × ${pixelDimensions.height}`
              : "(choose an image first)"}
          </td>
        </tr>
        <tr>
          <th>Feet Dimensions</th>
          <td className="map-fields-dimension-pair">
            <NumberField value={mapData.feetDimensions?.width} onChange={(v) => setFeetDimension("width", v)} />
            <span>×</span>
            <NumberField value={mapData.feetDimensions?.height} onChange={(v) => setFeetDimension("height", v)} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}
