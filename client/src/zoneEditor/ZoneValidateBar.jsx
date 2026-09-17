import {useState} from "react";
import {resolveZoneRefs} from "./resolveZoneRefs";
import {validateZone} from "../validators/validateContent";

// Validate-only for now - no Save button (see plans/zone-editor.md step
// 11, deliberately deferred until it has something real to commit).
// Resolves every $ref client-side (resolveZoneRefs.js) before posting to
// the server validator, since ZoneValidator rejects $ref map/unitType
// entries outright - the same resolved-form requirement the class/unit
// type editors' own Validate already has.
export default function ZoneValidateBar({zoneData, zoneKey}) {
  const [status, setStatus] = useState({state: "idle"});

  async function handleValidate() {
    setStatus({state: "validating"});
    try {
      const fullZone = await resolveZoneRefs(zoneData, `zones/${zoneKey}`);
      const {valid, error} = await validateZone(fullZone);
      setStatus(valid ? {state: "valid"} : {state: "invalid", message: error.message});
    } catch (error) {
      setStatus({state: "invalid", message: error.message});
    }
  }

  const validating = status.state === "validating";

  return (
    <div className="save-bar">
      <button type="button" className="validate-button" onClick={handleValidate} disabled={validating}>
        {validating ? "Validating…" : "Validate"}
      </button>
      {status.state === "invalid" && <span className="save-message save-error">{status.message}</span>}
      {status.state === "valid" && <span className="save-message save-success">Valid.</span>}
    </div>
  );
}
