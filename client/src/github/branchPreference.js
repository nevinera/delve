// Every content editor (world, class, ability) starts on the branch last
// picked in any of them, remembered in this browser. Storage can be
// unavailable (private windows, blocked site data), so every access is
// guarded and a miss just means "use the default branch".
const KEY = "delve.editor.branch";

export function rememberedBranch() {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function rememberBranch(branch) {
  try {
    window.localStorage.setItem(KEY, branch);
  } catch {
    // not remembered; harmless
  }
}

// Opened from an index page with ?branch=: start on that branch (the
// remembered choice), then drop it from the URL so a later reload doesn't
// override whatever the picker is switched to.
export function adoptBranchParam() {
  const url = new URL(window.location.href);
  const branch = url.searchParams.get("branch");
  if (!branch) return;
  rememberBranch(branch);
  url.searchParams.delete("branch");
  window.history.replaceState(window.history.state, "", url);
}
