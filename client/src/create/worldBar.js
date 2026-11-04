import { GithubAuthError } from "../github/github.js";
import { keptSource, onSourceSaved } from "./keptSave.js";
import { dropLibraryChanges, localLibraryChanges, openRepoKept, replaceLibrary } from "./keptOpen.js";
import { fromRepo } from "./repo.js";

// What /objects and /classes share for reaching a world on their own: a form to open a GitHub repo,
// the repo they're on, and a button to drop their local changes.

const couldnt = (repo, e) => (e instanceof GithubAuthError ? "Connect GitHub first, from your worlds page." : `Couldn't open ${repo}: ${e.message}`);

// Opens the repo in the page's address (`?from=github/owner/repo`), before the page reads the kept
// world. say(message, { info }) tells how it goes.
export async function openFromAddress(say) {
  const repo = fromRepo(new URLSearchParams(window.location.search).get("from"));
  if (!repo) return;
  try {
    say(`Opening ${repo}…`, { info: true });
    const opened = await openRepoKept(repo, {
      confirm: (message) => window.confirm(message),
      onProgress: ({ done, total }) => say(`Downloading ${done} of ${total} files…`, { info: true }),
    });
    if (opened) await replaceLibrary(opened.files);
    say("");
  } catch (e) {
    console.error(`couldn't open ${repo}`, e);
    say(couldnt(repo, e));
  }
}

// Fills `root` in. `flush` keeps what the page has changed, for counting it.
export async function worldBar(root, { say, flush = async () => {} }) {
  const source = document.createElement("span");
  source.className = "library-source";
  const form = document.createElement("form");
  form.className = "library-open";
  form.innerHTML = '<input placeholder="owner/repo" aria-label="GitHub repo" autocomplete="off"><button type="submit">open repo</button>';
  const input = form.querySelector("input");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const repo = input.value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$|\/$/g, "");
    if (fromRepo(`github/${repo}`)) window.location.search = `?from=github/${repo}`;
    else say("Give the repo as owner/name.");
  });
  const drop = document.createElement("button");
  drop.type = "button";
  drop.textContent = "drop local changes";
  drop.title = "puts classes and objects back to what was last opened or saved. It leaves the world's other changes alone";
  drop.addEventListener("click", async () => {
    await flush();
    const count = await localLibraryChanges();
    if (!count) return say("There are no local class or object changes.", { info: true });
    if (!window.confirm(`Drop ${count} unsaved class and object file${count === 1 ? "" : "s"}? This can't be undone. The world's other changes stay.`)) return;
    await dropLibraryChanges();
    window.location.reload();
  });
  const showSource = (kept) => {
    source.textContent = kept?.repo ? `${kept.repo} at ${kept.commitSha?.slice(0, 7) ?? "no commits yet"}` : "";
    if (kept?.repo) input.value = kept.repo;
  };
  showSource(await keptSource());
  onSourceSaved(showSource);
  root.replaceChildren(source, form, drop);
}
