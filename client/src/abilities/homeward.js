import HOMEWARD from "./homeward.json";

// Homeward, the ability every class has, which takes a character home: the game server adds the
// same one (game-server/internal/combat/homeward.json) to every class it reads.
export { HOMEWARD };

// A class with Homeward, in place of any ability of its own with that id.
export function withHomeward(made) {
  if (!made) return made;
  return { ...made, abilities: [...(made.abilities ?? []).filter((a) => a.id !== HOMEWARD.id), HOMEWARD] };
}
