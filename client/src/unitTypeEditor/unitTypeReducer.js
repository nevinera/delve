// Same generic SET_FIELD/UPDATE_ENTRY_FIELD/ADD_ENTRY/REMOVE_ENTRY shape as
// the ability editor's draft state - nothing here is unit-type-specific, so
// the unit type editor reuses it as-is rather than duplicating it.
export {abilityReducer as unitTypeReducer} from "../editor/abilityReducer";
