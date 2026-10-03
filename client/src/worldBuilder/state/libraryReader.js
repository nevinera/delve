// Reads the shared library (anything in the repo outside worlds/) at the
// draft's commit, the way GithubClient reads the default branch - so the
// existing power import sources (powerSources.js) and $ref expansion work
// against it unchanged. Each top-level directory is listed once, on first
// use; file contents are cached.
export class LibraryReader {
  constructor(client, commitSha) {
    this.client = client;
    this.commitSha = commitSha;
    this._dirs = new Map();
    this._texts = new Map();
  }

  _top(path) {
    const top = path.split("/")[0];
    if (!this._dirs.has(top)) this._dirs.set(top, this.client.snapshot(this.commitSha, top).then(({files}) => files));
    return this._dirs.get(top);
  }

  // Every file path under dir (repo-relative), sorted.
  async listDirectory(dir) {
    const files = await this._top(dir);
    return Object.keys(files).filter((path) => path.startsWith(`${dir}/`)).sort();
  }

  async blobSha(path) {
    return (await this._top(path))[path]?.sha ?? null;
  }

  // The file's text, or null if it doesn't exist.
  async fetchFile(path) {
    if (!this._texts.has(path)) {
      this._texts.set(path, this.blobSha(path).then((sha) => (sha ? this.client.readBlobText(sha) : null)));
    }
    return this._texts.get(path);
  }
}
