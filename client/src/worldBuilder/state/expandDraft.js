// The world editor's Expand (see plans/world-editor/01-world-and-zone.md,
// 1g): writes every zone's fully resolved form to <zone>.full.json - what
// the importer and game read - in one commit. Only run on a draft with no
// unsaved changes, so what's expanded is exactly what's in git.
import {commitFiles} from "../../github/commitFiles";
import {loadSnapshot} from "./RepoSnapshot";
import {WorldDraft, stableStringify} from "./WorldDraft";
import {zoneKeys} from "./worldOps";
import {resolveZone} from "./zoneOps";
import {zoneFullFile} from "./worldPaths";

// {path: resolved zone} for every zone whose .full.json is missing or out
// of date. Throws if a zone doesn't resolve.
export function staleExpansions(draft) {
  const stale = {};
  for (const zone of zoneKeys(draft)) {
    const path = zoneFullFile(draft.worldKey, zone);
    const full = resolveZone(draft, zone);
    if (stableStringify(draft.read(path)) !== stableStringify(full)) stale[path] = full;
  }
  return stale;
}

// True when every zone's committed .full.json matches its resolved form.
export function isExpanded(draft) {
  try {
    return Object.keys(staleExpansions(draft)).length === 0;
  } catch {
    return false;
  }
}

export async function expandDraft(client, draft, message) {
  if (draft.hasChanges) throw new Error("Save before expanding");
  const files = staleExpansions(draft);
  if (Object.keys(files).length === 0) return {snapshot: draft.snapshot, draft};
  const {snapshot} = draft;
  await commitFiles(files, {message, branch: snapshot.branch, parentSha: snapshot.commitSha});
  const next = await loadSnapshot(client, snapshot.branch, snapshot.worldKey);
  return {snapshot: next, draft: WorldDraft.fromSnapshot(next)};
}
