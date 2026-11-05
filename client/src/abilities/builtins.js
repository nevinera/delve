import BUILTINS from "./builtins.json";

// What every class has, besides its own: the Homeward ability, which takes a character home, and
// the Resting status, which the game server puts on a character in a rest point's area. The game
// server adds the same (game-server/internal/combat/builtins.json) to every class it reads.
export const HOMEWARD = BUILTINS.abilities.find((a) => a.id === "homeward");
export const RESTING = BUILTINS.statuses.find((s) => s.id === "resting");

// A class with what every class has, in place of any of its own with the same ids.
export function withBuiltins(made) {
  if (!made) return made;
  const add = (own = [], extra) => [...own.filter((x) => !extra.some((e) => e.id === x.id)), ...extra];
  return { ...made, abilities: add(made.abilities, BUILTINS.abilities), statuses: add(made.statuses, BUILTINS.statuses) };
}
