import {describe, it, expect, vi, afterEach} from "vitest";
import {GithubClient, GithubAuthError} from "../delve-github";
import * as tokenModule from "../token";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GithubClient#fetchFile", () => {
  it("decodes the base64 content GitHub returns", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({content: btoa('{"name":"Sword"}')}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GithubClient().fetchFile("items/sword.json");

    expect(result).toBe('{"name":"Sword"}');
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/nevinera/delve-content/contents/items/sword.json",
      expect.objectContaining({headers: expect.objectContaining({Authorization: "Bearer tok"})})
    );
  });

  it("returns null for a 404 (file doesn't exist yet), not an error", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: false, status: 404}));

    const result = await new GithubClient().fetchFile("items/missing.json");

    expect(result).toBeNull();
  });

  it("throws on a non-404 error response", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: false, status: 500, statusText: "Server Error", json: async () => ({message: "boom"})}));

    await expect(new GithubClient().fetchFile("items/sword.json")).rejects.toThrow(/boom/);
  });

  it("caches the token across multiple calls on the same instance", async () => {
    const fetchTokenSpy = vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: true, status: 200, json: async () => ({content: btoa("{}")})}));

    const client = new GithubClient();
    await client.fetchFile("items/a.json");
    await client.fetchFile("items/b.json");

    expect(fetchTokenSpy).toHaveBeenCalledTimes(1);
  });

  it("propagates GithubAuthError from an expired/missing connection", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockRejectedValue(new GithubAuthError("reauth_required", "/github/reauth"));

    await expect(new GithubClient().fetchFile("items/a.json")).rejects.toBeInstanceOf(GithubAuthError);
  });
});

describe("GithubClient#assetUrl", () => {
  it("builds a raw.githubusercontent.com URL using the repo's default branch", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({default_branch: "main"})});
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GithubClient().assetUrl("abilities/graphics/icons/punch.svg");

    expect(result).toBe("https://raw.githubusercontent.com/nevinera/delve-content/main/abilities/graphics/icons/punch.svg");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/nevinera/delve-content",
      expect.objectContaining({headers: expect.objectContaining({Authorization: "Bearer tok"})})
    );
  });

  it("caches the default branch across multiple calls on the same instance", async () => {
    vi.spyOn(tokenModule, "fetchToken").mockResolvedValue({token: "tok", repo_full_name: "nevinera/delve-content"});
    const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({default_branch: "main"})});
    vi.stubGlobal("fetch", fetchMock);

    const client = new GithubClient();
    await client.assetUrl("a.svg");
    await client.assetUrl("b.svg");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
