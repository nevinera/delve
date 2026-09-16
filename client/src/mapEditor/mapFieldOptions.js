// Mirrors Validators::MapValidator's enums (app/services/validators/map_validator.rb) - no
// server round-trip for these, same convention as itemFieldOptions.js.
export const BARRIER_TYPES = ["wall", "circle"];
export const CONNECTION_TYPES = ["point", "line"];
export const MOVEMENT_TYPES = ["still", "patrol", "wander"];
export const PATROL_CHOOSE_OPTIONS = ["return", "loop", "random"];
export const LIGHTING_OPTIONS = ["daylight", "torchlight"];
