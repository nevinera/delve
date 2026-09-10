import {useState} from "react";

// Drives the "Validate, then Save" flow shared by the ability and class
// editors. Two independent pieces of state:
//   - validity ("unknown" | "valid" | "invalid"): whether the draft, as of
//     the last Validate click, passed. Only an edit (markDirty, called from
//     the editor's own dispatch wrapper) resets it back to "unknown" - a
//     failed Save attempt does NOT require revalidating an unchanged draft.
//   - activity: what's currently happening / the outcome of the last
//     Validate or Save click, for messages and button labels.
export function useValidateThenSave() {
  const [validity, setValidity] = useState("unknown");
  const [activity, setActivity] = useState({status: "idle"});

  return {
    validity,
    activity,
    markDirty: () => setValidity((current) => (current === "unknown" ? current : "unknown")),
    setValidating: () => setActivity({status: "validating"}),
    setValid: () => {
      setValidity("valid");
      setActivity({status: "idle"});
    },
    setInvalid: (message) => {
      setValidity("invalid");
      setActivity({status: "invalid", message});
    },
    setSaving: () => setActivity({status: "saving"}),
    setSaved: () => setActivity({status: "success"}),
    setSaveError: (message) => setActivity({status: "save_error", message}),
  };
}
