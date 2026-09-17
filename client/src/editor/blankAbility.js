// JS port of Build::AbilitiesController#blank_ability - used when
// GithubClient's fetch turns up nothing (a brand new key), since the
// ability editor no longer bootstraps with any server-fetched content
// (see plans/editor-git.md).
export function blankAbility(key) {
  const name = key
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  return {
    name,
    description: "",
    castTime: null,
    globalCooldown: 1.0,
    tags: [],
    graphicEffects: [],
    soundEffects: [],
    effects: [],
  };
}
