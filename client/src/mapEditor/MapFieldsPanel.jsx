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

// Client-only display setting for the walk preview (see
// MapPreviewScene.js's setLightingMode) - the game server never reads this
// field (see docs/schema/map.md). Defaults to "daylight" when unset, same
// as Build::MapsController#blank_map.
function LightingSelect({value, onChange}) {
  return (
    <select value={value ?? "daylight"} onChange={(e) => onChange(e.target.value)}>
      <option value="daylight">Daylight</option>
      <option value="torchlight">Torchlight</option>
    </select>
  );
}

// pixelDimensions is never hand-edited - it's read straight off the loaded
// image (see MapEditor's sync effect), only feetDimensions is an authoring
// decision.
export default function MapFieldsPanel({mapData, pixelDimensions, dispatch}) {
  function setField(field, value) {
    dispatch({type: "SET_FIELD", field, value});
  }

  // The background image's own aspect ratio is known (pixelDimensions) once
  // one's loaded, and a map's background is never meant to render stretched
  // - so editing one feet axis derives the other from that same ratio,
  // rather than leaving them free to drift out of proportion. Clearing a
  // field (value === null) doesn't touch the other axis. No image yet -
  // no ratio to derive from - leaves both axes independent, as before.
  function setFeetDimension(axis, value) {
    const current = mapData.feetDimensions ?? {};
    if (value == null || !pixelDimensions?.width || !pixelDimensions?.height) {
      setField("feetDimensions", {...current, [axis]: value});
      return;
    }
    const ratio = pixelDimensions.width / pixelDimensions.height;
    const otherAxis = axis === "width" ? "height" : "width";
    const otherValue = axis === "width" ? value / ratio : value * ratio;
    setField("feetDimensions", {...current, [axis]: value, [otherAxis]: Math.round(otherValue * 100) / 100});
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
        <tr>
          <th>Lighting</th>
          <td><LightingSelect value={mapData.lighting} onChange={(v) => setField("lighting", v)} /></td>
        </tr>
      </tbody>
    </table>
  );
}
