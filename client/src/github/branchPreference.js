// Every content editor (world, class, ability), and every index page that
// lists content (see Build::BranchSelection), uses the branch last picked
// in any of them - remembered in a cookie so the server-rendered lists can
// read it too. A miss just means "use the default branch".
export const COOKIE = "delve_editor_branch";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function rememberedBranch() {
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${COOKIE}=`));
  return entry ? decodeURIComponent(entry.slice(COOKIE.length + 1)) : null;
}

export function rememberBranch(branch) {
  document.cookie = `${COOKIE}=${encodeURIComponent(branch)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
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
