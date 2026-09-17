import {describe, it, expect, vi, beforeEach} from "vitest";
import {fetchToken, GithubAuthError} from "../token";

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchToken", () => {
  it("returns the parsed token response on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({token: "gho_test", repo_full_name: "nevinera/delve-content"}),
    }));

    await expect(fetchToken()).resolves.toEqual({token: "gho_test", repo_full_name: "nevinera/delve-content"});
  });

  it("throws GithubAuthError with the connect_url when not connected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({error: "not_connected", connect_url: "/github/connect"}),
    }));

    await expect(fetchToken()).rejects.toMatchObject({
      constructor: GithubAuthError,
      code: "not_connected",
      redirectUrl: "/github/connect",
    });
  });

  it("throws GithubAuthError with the reauth_url when reauth is required", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({error: "reauth_required", reauth_url: "/github/reauth"}),
    }));

    await expect(fetchToken()).rejects.toMatchObject({code: "reauth_required", redirectUrl: "/github/reauth"});
  });
});
