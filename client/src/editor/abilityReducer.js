// Minimal reducer for the in-browser ability draft. Only SET_FIELD exists so
// far (backs the speed/maxRange proof-of-concept editing) - ADD_ENTRY/
// REMOVE_ENTRY/UPDATE_ENTRY_FIELD for the graphicEffects/soundEffects/effects
// arrays will follow the same shape once we build editing UX for them.
export function abilityReducer(state, action) {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    default:
      return state;
  }
}
