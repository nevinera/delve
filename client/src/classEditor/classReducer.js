// Same generic SET_FIELD/UPDATE_ENTRY_FIELD/ADD_ENTRY/REMOVE_ENTRY shape as
// the ability editor's draft state - nothing here is ability-specific, so
// the class editor reuses it as-is rather than duplicating it.
export {abilityReducer as classReducer} from "../editor/abilityReducer";
