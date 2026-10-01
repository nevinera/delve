import {describe, it, expect, vi, afterEach} from "vitest";
import {publishWorld} from "../publishWorld";

describe("publishWorld", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(status, body) {
    const fetchMock = vi.fn(async () => ({ok: status < 300, status, json: async () => body}));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("posts the tag as JSON and returns the response", async () => {
    const fetchMock = stubFetch(200, {url: "/build/publishing/worlds/7"});
    const result = await publishWorld("/build/worlds/demo/publish", "demo/v1");

    expect(result).toEqual({url: "/build/publishing/worlds/7"});
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/build/worlds/demo/publish");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({tag: "demo/v1"});
  });

  it("throws Rails' error message on failure", async () => {
    stubFetch(422, {error: 'Tag "demo/v1" already exists.'});
    await expect(publishWorld("/build/worlds/demo/publish", "demo/v1")).rejects.toThrow('Tag "demo/v1" already exists.');
  });
});
