import {useState} from "react";

// Drives the "Validate, then Save" flow shared by the ability and class
// editors. Two independent pieces of state:
//   - validity ("unknown" | "valid" | "invalid"): whether the draft, as of
//     the last Validate click, passed. Only an edit (markDirty, called from
//     the editor's own dispatch wrapper) resets it back to "unknown" - a
//     failed Save attempt does NOT require revalidating an unchanged draft.
//   - activity: what's currently happening / the outcome of the last
//     Validate or Save click, for messages and button labels.
// dirty says whether there are edits since the last load (reset) or save -
// e.g. the branch picker is locked while there are.
export function useValidateThenSave() {
  const [validity, setValidity] = useState("unknown");
  const [activity, setActivity] = useState({status: "idle"});
  const [dirty, setDirty] = useState(false);

  return {
    validity,
    activity,
    dirty,
    markDirty: () => {
      setDirty(true);
      setValidity((current) => (current === "unknown" ? current : "unknown"));
    },
    reset: () => {
      setDirty(false);
      setValidity("unknown");
      setActivity({status: "idle"});
    },
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
    setSaved: () => {
      setDirty(false);
      setActivity({status: "success"});
    },
    setSaveError: (message) => setActivity({status: "save_error", message}),
  };
}
