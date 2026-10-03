// A fake BranchClient over a repo of {path: content} (JSON values
// stringified; anything else is an asset).
export function fakeClient(repo) {
  const sha = (path) => `sha:${path}`;
  return {
    snapshot: async (commitSha, dir) => ({
      commitSha,
      files: Object.fromEntries(Object.keys(repo).filter((p) => p.startsWith(`${dir}/`)).map((p) => [p, {sha: sha(p), size: 1}])),
    }),
    readBlobText: async (blobSha) => {
      const value = repo[blobSha.slice(4)];
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  };
}
