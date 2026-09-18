function TextField({value, onChange, placeholder}) {
  return <input type="text" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

function ZoneSelect({value, zoneKeys, onChange}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a zone…</option>
      {zoneKeys.map((key) => <option key={key} value={key}>{key}</option>)}
    </select>
  );
}

function KindSelect({value, onChange}) {
  return (
    <select value={value ?? "open"} onChange={(e) => onChange(e.target.value)}>
      <option value="open">Open Connection</option>
      <option value="entryPoint">Entry Point</option>
    </select>
  );
}

// Every connection point a given zone actually exposes, for the given
// kind - openConnections by their exposed name, entryPoints by their own
// raw "mapId/connectionId" key (see docs/schema/world.md's ZoneReference).
// Falls back to a bare TextField (typed by hand) when the zone's real
// detail hasn't been fetched yet (see WorldEditor's zoneDetailsByKey/
// "Refresh Connections") - same degrade-gracefully reasoning
// ZoneMapConnectionsPanel's own picker has, just one level up.
function ConnectionSelect({zoneDetail, kind, value, onChange}) {
  if (!zoneDetail) return <TextField value={value} onChange={onChange} placeholder="connection name" />;

  const options = kind === "entryPoint" ? Object.keys(zoneDetail.entryPoints ?? {}) : Object.values(zoneDetail.openConnections ?? {});
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a connection…</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

// One row per worldLink, linking a ZoneReference (zone + kind + connection,
// see docs/schema/world.md) on each side. A zone's entryPoints are just
// more available connection points from a world's perspective (see
// WorldGraphCanvas's own comment) - usable here exactly like an
// openConnection.
export default function WorldLinksPanel({draft, onChange, zoneDetailsByKey}) {
  const zoneKeys = Object.keys(draft.data.zones ?? {});
  const worldLinks = draft.data.worldLinks ?? [];

  function updateSide(index, side, field, value) {
    onChange(draft.updateWorldLinkSide(index, side, field, value));
  }

  return (
    <div>
      <h3>World Links</h3>
      {worldLinks.length === 0 && <p className="map-sidebar-hint">No world links yet.</p>}
      {worldLinks.map((link, i) => (
        <div className="entry-block" key={i}>
          <div className="entry-heading-row">
            <h4>Link {i + 1}</h4>
            <button type="button" className="remove-entry" onClick={() => onChange(draft.removeWorldLink(i))}>Remove</button>
          </div>
          <table>
            <tbody>
              <tr>
                <th>Zone A</th>
                <td>
                  <ZoneSelect value={link.zoneA?.zone} zoneKeys={zoneKeys} onChange={(v) => updateSide(i, "zoneA", "zone", v)} />
                  <KindSelect value={link.zoneA?.kind} onChange={(v) => updateSide(i, "zoneA", "kind", v)} />
                  <ConnectionSelect
                    zoneDetail={zoneDetailsByKey[link.zoneA?.zone]}
                    kind={link.zoneA?.kind}
                    value={link.zoneA?.connection}
                    onChange={(v) => updateSide(i, "zoneA", "connection", v)}
                  />
                </td>
              </tr>
              <tr>
                <th>Zone B</th>
                <td>
                  <ZoneSelect value={link.zoneB?.zone} zoneKeys={zoneKeys} onChange={(v) => updateSide(i, "zoneB", "zone", v)} />
                  <KindSelect value={link.zoneB?.kind} onChange={(v) => updateSide(i, "zoneB", "kind", v)} />
                  <ConnectionSelect
                    zoneDetail={zoneDetailsByKey[link.zoneB?.zone]}
                    kind={link.zoneB?.kind}
                    value={link.zoneB?.connection}
                    onChange={(v) => updateSide(i, "zoneB", "connection", v)}
                  />
                </td>
              </tr>
              <tr>
                <th>One Way</th>
                <td><input type="checkbox" checked={link.oneWay === true} onChange={(e) => onChange(draft.updateEntryField("worldLinks", i, "oneWay", e.target.checked))} /></td>
              </tr>
              <tr>
                <th>Required Key</th>
                <td><TextField value={link.requiredKey} onChange={(v) => onChange(draft.updateEntryField("worldLinks", i, "requiredKey", v))} placeholder="none" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
      <div className="add-buttons-row">
        <button
          type="button" className="add-entry"
          onClick={() => onChange(draft.addWorldLink({zone: "", kind: "open", connection: ""}, {zone: "", kind: "open", connection: ""}))}
        >
          + Add World Link
        </button>
      </div>
    </div>
  );
}
