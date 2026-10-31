# Opening, saving and publishing worlds on GitHub

`/create` reads and writes a world's repo straight from the browser, through GitHub's REST API. Code: `client/src/github/github.js` (the API) and `client/src/create/repo.js`.

## Tokens

The browser gets a GitHub App user token from Rails at `GET /github/token`, as `{ token, expires_at, login }`, and fetches a new one shortly before it expires. A 401 means you need to connect GitHub (`connect_url`) or authorize again (`reauth_url`).

## Opening

`/create?from=github/<owner>/<repo>` opens the head of the repo's default branch.

1. Read the branch's head commit. A repo with no commits opens as an empty world.
2. List every file at that commit with its blob sha.
3. Download each file's blob, a few at a time. Reads go through the blob API, pinned to the commit, so a branch that moves during the load doesn't mix commits.

A repo with no `world.json` (only a README or a LICENSE, say) opens as a new world named after the repo, and keeps its files.

The world remembers where it came from: `{ repo, branch, commitSha, shas }`, where `shas` maps each path to its blob sha. Opening the same repo again skips files whose sha hasn't changed.

## Saving

Saving makes one commit on the branch the world came from. A repo with no commits gets its `world.json` first through the contents API, since the git data API can't commit there.

1. Work out each file's blob sha (SHA-1 of `blob <length>\0` followed by its bytes). A file whose sha matches `shas` hasn't changed. A path in `shas` that the world no longer has is a deletion.
2. Check the branch head. If it's no longer `commitSha`, refuse: saving would drop someone else's commit.
3. Upload changed binary files as blobs. Text files (`.plate`, `.json`, `.md`, `.txt`) go inline in the tree.
4. Build the tree in requests of at most 10 MB of inline text and 500 files, each building on the last. GitHub refuses a tree request over about 40 MB, and times one out after about 10 s.
5. Make the commit and move the branch to it.

After a save, the new commit and shas become the world's source, so the next save sends only what changed since.

## Publishing

A published version is a tag on a saved commit, named `v1`, `v2` and so on: one more than the highest `v<n>` tag. Publishing refuses while anything is unsaved, and when the commit is published already. Nothing checks the world first.

