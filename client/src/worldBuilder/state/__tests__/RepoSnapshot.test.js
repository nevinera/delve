import {describe, it, expect, vi} from "vitest";
import {loadSnapshot} from "../RepoSnapshot";

function fakeClient(files, texts) {
  return {
    headSha: vi.fn().mockResolvedValue("head-sha"),
    snapshot: vi.fn().mockResolvedValue({commitSha: "head-sha", files}),
    readBlobText: vi.fn((sha) => Promise.resolve(texts[sha])),
  };
}

describe("loadSnapshot", () => {
  it("pins to the branch head and parses every JSON file, leaving assets unread", async () => {
    const client = fakeClient(
      {
        "worlds/small/small.json": {sha: "s1", size: 1},
        "worlds/small/zones/forest/hub/hub.png": {sha: "p1", size: 9},
      },
      {s1: '{"name": "Small"}'}
    );

    const snapshot = await loadSnapshot(client, "world-editor", "small");

    expect(client.headSha).toHaveBeenCalledWith("world-editor");
    expect(client.snapshot).toHaveBeenCalledWith("head-sha", "worlds/small");
    expect(client.readBlobText).toHaveBeenCalledTimes(1);
    expect(snapshot).toMatchObject({worldKey: "small", branch: "world-editor", commitSha: "head-sha"});
    expect(snapshot.json).toEqual({"worlds/small/small.json": {name: "Small"}});
    expect(snapshot.blobSha("worlds/small/zones/forest/hub/hub.png")).toEqual("p1");
  });

  it("names the file that isn't valid JSON", async () => {
    const client = fakeClient({"worlds/small/small.json": {sha: "s1", size: 1}}, {s1: "{nope"});

    await expect(loadSnapshot(client, "b", "small")).rejects.toThrow(/worlds\/small\/small.json isn't valid JSON/);
  });
});
