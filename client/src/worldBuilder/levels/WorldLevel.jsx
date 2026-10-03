import {worldData, zoneKeys} from "../state/worldOps";

// The world level: graph (top-left), world attributes (bottom-left), zone
// list (right). Filled out in step 1d.
export default function WorldLevel({draft, navigate}) {
  const world = worldData(draft);
  return (
    <>
      <div className="content-editor-left">
        <div className="content-editor-preview"><p className="config-empty">World graph (coming in 1d)</p></div>
      </div>
      <div className="content-editor-fields">
        <h3>Zones</h3>
        {zoneKeys(draft).length === 0 && <p className="config-empty">No zones yet.</p>}
        <ul className="zone-list">
          {zoneKeys(draft).map((key) => (
            <li key={key}>
              <button type="button" className="crumb-link" onClick={() => navigate({zone: key})}>{world.zones[key].name || key}</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
