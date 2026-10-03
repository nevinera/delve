// Displayable URLs for a draft's assets: a pending upload gets an object
// URL (one per Blob, reused), a file in git a raw.githubusercontent.com URL
// pinned to the snapshot's commit. A file moved within the draft is still
// in git under its old path, so it's found there by blob SHA.
const objectUrls = new WeakMap();

function objectUrlFor(blob) {
  if (!objectUrls.has(blob)) objectUrls.set(blob, URL.createObjectURL(blob));
  return objectUrls.get(blob);
}

export function assetUrlFor(draft, repo, path) {
  const source = draft.assetSource(path);
  if (!source) return null;
  if (source.blob) return objectUrlFor(source.blob);
  if (!repo) return null;
  const {snapshot} = draft;
  const gitPath = snapshot.blobSha(path) === source.sha ? path : Object.keys(snapshot.files).find((p) => snapshot.files[p].sha === source.sha);
  return gitPath ? `https://raw.githubusercontent.com/${repo}/${snapshot.commitSha}/${gitPath}` : null;
}
