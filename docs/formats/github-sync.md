# Opening, saving and publishing worlds on GitHub

The editor reads and writes a world's repo straight from the browser, through GitHub's REST API. Code: `client/src/github/github.js` (the API) and `client/src/editor/githubWorld.js` (worlds).

## Tokens

The browser gets a GitHub App user token from Rails at `GET /github/token`, as `{ token, expires_at, login }`, and fetches a new one shortly before it expires. A 401 means you need to connect GitHub (`connect_url`) or authorize again (`reauth_url`).

## Opening

`/editor?from=github/<owner>/<repo>` opens the head of the repo's default branch.

1. Read the branch's head commit. A repo with no commits opens as an empty world.
2. List every file at that commit with its blob sha.
3. Download each file's blob, a few at a time. Reads go through the blob API, pinned to the commit, so a branch that moves during the load doesn't mix commits.
4. Split plates into tile files (see [plates](plates.md)), on a few workers.

A repo with files but none of a world's (only a README or a LICENSE, say) opens as a new world named after the repo, and keeps those files.

The world remembers where it came from: `{ repo, branch, commitSha, shas }`, where `shas` maps each path to its blob sha. Opening the same repo again skips files whose sha hasn't changed. For a plate, the editor reuses the tiles it already holds.

## Saving

Saving makes one commit on the branch the world came from. The editor's save button, there in every step, opens a dialog that logs each stage and stays open until the save is done.

1. Pack tiles into plates and write each continent's `plates.json`.
2. Work out each file's blob sha (SHA-1 of `blob <length>\0` followed by its bytes). A file whose sha matches `shas` hasn't changed. A path in `shas` that the world no longer has is a deletion.
3. Check the branch head. If it's no longer `commitSha`, refuse: saving would drop someone else's commit. The editor offers to open the world again.
4. Upload changed binary files as blobs. Text files (`.plate`, `.json`, `.md`, `.txt`) go inline in the tree.
5. Build the tree in requests of at most 10 MB of inline text and 500 files, each building on the last. GitHub refuses a tree request over about 40 MB, and times one out after about 10 s.
6. Make the commit and move the branch to it.

After a save, the new commit and shas become the world's source, so the next save sends only what changed since.

## Publishing

A published version is a tag on a saved commit, named `v1`, `v2` and so on by default. Saving never validates. The editor's publish step does:

1. It shows the last published version, what's changed since it, anything unsaved, and the world's size.
2. **Validate** packs the world as it would be stored and runs the validator (`client/src/world/validate.js`) on a worker. It lists the first 50 problems and warnings.
3. **Publish** stays off until validating finds no problems, nothing is unsaved, and the commit isn't published already. The tag defaults to one more than the highest `v<n>` tag.
4. Publishing creates the tag on the saved commit (`POST /repos/<repo>/git/refs`).

