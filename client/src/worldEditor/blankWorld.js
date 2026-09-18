// Used when GithubClient's fetch turns up nothing (a brand new key) - same
// "doesn't exist yet" fallback every other editor's blank* helper provides
// (see e.g. itemEditor/blankItem.js).
export function blankWorld(key) {
  const name = key
    .split("/")
    .pop()
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  return {
    name, description: null, thumbnailUrl: null, elevationRange: null,
    zones: {}, worldLinks: [], entryPoints: {},
  };
}
