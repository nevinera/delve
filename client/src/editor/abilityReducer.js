// Reducer for the in-browser ability draft.
export function abilityReducer(state, action) {
  switch (action.type) {
    // Replaces the whole draft wholesale - used once, right after a
    // client-side fetch (GithubClient#fetchFile) resolves on mount, since
    // the editor no longer bootstraps with server-fetched content (see
    // plans/editor-git.md). Every other action assumes state is already
    // the real draft object, so this has to land before any of them can
    // fire.
    case "LOAD":
      return action.data;

    case "SET_FIELD":
      return {...state, [action.field]: action.value};

    case "UPDATE_ENTRY_FIELD": {
      const {section, index, field, value} = action;
      const entries = state[section].map((entry, i) => (i === index ? {...entry, [field]: value} : entry));
      return {...state, [section]: entries};
    }

    // Sets several fields on one entry atomically - used when picking a
    // stock asset, which needs to set sourceURL together with whatever
    // sprite/duration fields go with it (see stockAssetFields.js), rather
    // than as separate UPDATE_ENTRY_FIELD dispatches.
    case "UPDATE_ENTRY_FIELDS": {
      const {section, index, fields} = action;
      const entries = state[section].map((entry, i) => (i === index ? {...entry, ...fields} : entry));
      return {...state, [section]: entries};
    }

    case "ADD_ENTRY": {
      const {section, entry} = action;
      return {...state, [section]: [...(state[section] ?? []), entry]};
    }

    case "REMOVE_ENTRY": {
      const {section, index} = action;
      return {...state, [section]: state[section].filter((_, i) => i !== index)};
    }

    default:
      return state;
  }
}
