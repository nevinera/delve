// JS port of Build::ItemsController#blank_item - used when GithubClient's
// fetch turns up nothing (a brand new key), since the item editor no longer
// bootstraps with any server-fetched content (see plans/editor-git.md).
export function blankItem(key) {
  const identifier = key.split("/").pop();
  const name = key
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  return {identifier, name, slot: "chest", elvl: 0, primary: null, secondaries: []};
}
