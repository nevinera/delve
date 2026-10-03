import {zoneData} from "../state/zoneOps";

// The zone level: graph, fields, maps, connections. Filled out in step 1e.
export default function ZoneLevel({draft, zone}) {
  const data = zoneData(draft, zone);
  return (
    <>
      <div className="content-editor-left">
        <div className="content-editor-preview"><p className="config-empty">Zone graph (coming in 1e)</p></div>
      </div>
      <div className="content-editor-fields">
        <h3>{data.name || zone}</h3>
        <p className="config-empty">{(data.maps ?? []).length} map(s)</p>
      </div>
    </>
  );
}
