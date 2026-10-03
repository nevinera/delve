// Commits the live draft's changes (WorldDraft#changes) as one commit on
// the snapshot's branch, built on the snapshot's commit - so if the branch
// moved since the world was loaded, the ref update fails rather than
// silently absorbing someone else's commit. Resolves to the fresh
// {snapshot, draft} (the draft with no changes) read back from the new
// commit.
import {commitFiles} from "../../github/commitFiles";
import {loadSnapshot} from "./RepoSnapshot";
import {WorldDraft} from "./WorldDraft";

export async function saveDraft(client, draft, message, {onProgress} = {}) {
  if (!draft.hasChanges) throw new Error("Nothing to save");
  const {snapshot} = draft;
  await commitFiles(draft.changes(), {message, branch: snapshot.branch, parentSha: snapshot.commitSha, onProgress});
  const next = await loadSnapshot(client, snapshot.branch, snapshot.worldKey);
  return {snapshot: next, draft: WorldDraft.fromSnapshot(next)};
}
