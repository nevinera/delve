// The branch picker remembers its last choice in this browser. Storage can
// be unavailable (private windows, blocked site data), so every access is
// guarded and a miss just means "use the default branch".
const KEY = "delve.worldEditor.branch";

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
