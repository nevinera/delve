// Reducer for the in-browser ability draft.
export function abilityReducer(state, action) {
  switch (action.type) {
    case "SET_FIELD":
      return {...state, [action.field]: action.value};

    case "UPDATE_ENTRY_FIELD": {
      const {section, index, field, value} = action;
      const entries = state[section].map((entry, i) => (i === index ? {...entry, [field]: value} : entry));
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
