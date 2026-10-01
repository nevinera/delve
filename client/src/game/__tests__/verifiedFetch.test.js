import {describe, it, expect, vi, afterEach} from "vitest";
import {fetchVerifiedJson, ContentChecksumError} from "../verifiedFetch";

const body = JSON.stringify({name: "Darkwood"});
// SHA1 of `body` as Rails computes it: Digest::SHA1.hexdigest('{"name":"Darkwood"}').
const railsSha = "d193df060a8f2e6028372d733fefa7ae7bbe68ce";

function stubFetch(text, {ok = true, status = 200} = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ok, status, arrayBuffer: async () => new TextEncoder().encode(text).buffer})));
}

async function sha1(text) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("fetchVerifiedJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed JSON when the checksum matches", async () => {
    stubFetch(body);
    expect(await fetchVerifiedJson("https://x/zone.json", await sha1(body))).toEqual({name: "Darkwood"});
  });

  it("refuses a file whose checksum doesn't match", async () => {
    stubFetch(body);
    await expect(fetchVerifiedJson("https://x/zone.json", "0".repeat(40))).rejects.toBeInstanceOf(ContentChecksumError);
  });

  it("skips the check when no checksum is known", async () => {
    stubFetch(body);
    expect(await fetchVerifiedJson("https://x/zone.json", "")).toEqual({name: "Darkwood"});
  });

  it("agrees with the checksum Rails records for the same bytes", async () => {
    stubFetch(body);
    expect(await fetchVerifiedJson("https://x/zone.json", railsSha)).toEqual({name: "Darkwood"});
  });

  it("fails on an HTTP error", async () => {
    stubFetch("", {ok: false, status: 404});
    await expect(fetchVerifiedJson("https://x/zone.json", "")).rejects.toThrow("HTTP 404");
  });
});
