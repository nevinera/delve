// JS port of Build::ClassesController#blank_class - used when
// GithubClient's fetch turns up nothing (a brand new key), since the class
// editor no longer bootstraps with any server-fetched content (see
// plans/editor-git.md).
export function blankClass(key) {
  const name = key
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  return {
    name,
    description: "",
    colors: {major: "888888", minor: "CCCCCC"},
    resources: [],
    powers: [],
    primaryStats: [],
    secondaryStats: [],
    wields: [],
  };
}
