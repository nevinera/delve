// Reducer for the in-browser ability draft. ADD_ENTRY/REMOVE_ENTRY for the
// graphicEffects/soundEffects/effects arrays aren't built yet - only editing
// fields on entries that already exist.
export function abilityReducer(state, action) {
  switch (action.type) {
    case "SET_FIELD":
      return {...state, [action.field]: action.value};

    case "UPDATE_ENTRY_FIELD": {
      const {section, index, field, value} = action;
      const entries = state[section].map((entry, i) => (i === index ? {...entry, [field]: value} : entry));
      return {...state, [section]: entries};
    }

    default:
      return state;
  }
}
