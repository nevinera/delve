// A map draft's top-level fields (identifier/name/elvl/feetDimensions) and
// its entry arrays (barriers/connections/units, added in later slices) fit
// the same generic SET_FIELD/ADD_ENTRY/REMOVE_ENTRY/UPDATE_ENTRY_FIELD shape
// abilityReducer already provides - nothing here is map-specific, so this
// reuses it as-is.
export {abilityReducer as mapReducer} from "../abilityEditor/abilityReducer";
