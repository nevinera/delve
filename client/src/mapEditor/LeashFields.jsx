// Leash settings (docs/schema/map.md's leashRadius/hardLeash), shared by the
// map's own fields and each placed unit's. Blank means "inherit": a unit
// falls back to its map's settings, and a map to the defaults (120 ft, not
// hard). Renders table rows, to sit inside either panel's field table.
export const DEFAULT_LEASH_RADIUS = 120;

function hardLeashValue(hardLeash) {
  if (hardLeash === true) return "on";
  if (hardLeash === false) return "off";
  return "";
}

export default function LeashFields({leashRadius, hardLeash, onChange, inheritLabel}) {
  return (
    <>
      <tr>
        <th>Leash radius</th>
        <td>
          <input
            type="number" step="any" min="1" aria-label="Leash radius"
            value={leashRadius ?? ""} placeholder={inheritLabel.radius}
            onChange={(e) => onChange({leashRadius: e.target.value === "" ? null : parseFloat(e.target.value)})}
          />
          {" "}ft
        </td>
      </tr>
      <tr>
        <th>Hard leash</th>
        <td>
          <select
            aria-label="Hard leash" value={hardLeashValue(hardLeash)}
            onChange={(e) => onChange({hardLeash: {on: true, off: false}[e.target.value] ?? null})}
          >
            <option value="">{inheritLabel.hard}</option>
            <option value="on">On: leash the moment it leaves the radius</option>
            <option value="off">Off</option>
          </select>
        </td>
      </tr>
    </>
  );
}
