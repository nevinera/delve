// A zone draft is flat for now (just SET_FIELD - see plans/zone-editor.md
// step 2) - reuses abilityReducer's generic handling rather than defining a
// new one, same as itemReducer. Later steps (maps/unitTypes/items/
// zoneLinks/entryPoints/openConnections lists) will likely need
// ADD_ENTRY/REMOVE_ENTRY-shaped actions too, which abilityReducer already
// provides.
export {abilityReducer as zoneReducer} from "../editor/abilityReducer";
