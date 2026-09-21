// JS port of Build::UnitTypesController#blank_unit_type - used when
// GithubClient's fetch turns up nothing (a brand new key), since the unit
// type editor no longer bootstraps with any server-fetched content (see
// plans/editor-git.md).
export function blankUnitType(key) {
  const name = key
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  return {
    name,
    description: "",
    tokenImageUrl: [],
    tokenRadius: 2.0,
    maxHP: 20,
    dps: 4.0,
    attackSpeed: 1.0,
    targeting: {type: "aggroTable"},
    tactics: {type: "randomAvailable"},
    powers: [],
  };
}
