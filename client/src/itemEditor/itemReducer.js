// An item draft is flat (no entry arrays like an ability's effects or a
// unit type's powers) - SET_FIELD is all it ever needs, so this just reuses
// abilityReducer's generic handling rather than defining a new one.
export {abilityReducer as itemReducer} from "../editor/abilityReducer";
