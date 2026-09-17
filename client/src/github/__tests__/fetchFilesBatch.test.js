import {describe, it, expect, vi, beforeEach} from "vitest";
import {fetchFilesBatch} from "../fetchFilesBatch";

function jsonResponse(body, ok = true, status = ok ? 200 : 400) {
  return {ok, status, statusText: "", json: () => Promise.resolve(body)};
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchFilesBatch", () => {
  it("returns an empty object without making any request for no paths", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFilesBatch([])).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches a token, then one GraphQL query aliasing every path", async () => {
    const fetchMock = vi.fn((url, options = {}) => {
      if (url === "/github/token") return Promise.resolve(jsonResponse({token: "gho_test", repo_full_name: "nevinera/delve-content"}));
      if (url === "https://api.github.com/graphql") {
        const body = JSON.parse(options.body);
        expect(body.query).toContain('f0: object(expression: "HEAD:unit_types/goblin.json")');
        expect(body.query).toContain('f1: object(expression: "HEAD:items/sword.json")');
        expect(options.headers.Authorization).toBe("Bearer gho_test");
        return Promise.resolve(jsonResponse({
          data: {repository: {f0: {text: '{"name":"Goblin"}'}, f1: {text: '{"name":"Sword"}'}}},
        }));
      }
      throw new Error(`unstubbed request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchFilesBatch(["unit_types/goblin.json", "items/sword.json"]);

    expect(result).toEqual({
      "unit_types/goblin.json": '{"name":"Goblin"}',
      "items/sword.json": '{"name":"Sword"}',
    });
  });

  it("resolves a missing file to null instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn((url) => {
      if (url === "/github/token") return Promise.resolve(jsonResponse({token: "gho_test", repo_full_name: "nevinera/delve-content"}));
      return Promise.resolve(jsonResponse({data: {repository: {f0: null}}}));
    }));

    const result = await fetchFilesBatch(["unit_types/missing.json"]);
    expect(result).toEqual({"unit_types/missing.json": null});
  });

  it("de-duplicates repeated paths into a single field", async () => {
    const fetchMock = vi.fn((url, options = {}) => {
      if (url === "/github/token") return Promise.resolve(jsonResponse({token: "gho_test", repo_full_name: "nevinera/delve-content"}));
      const body = JSON.parse(options.body);
      expect(body.query.match(/object\(expression:/g)).toHaveLength(1);
      return Promise.resolve(jsonResponse({data: {repository: {f0: {text: "{}"}}}}));
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchFilesBatch(["items/sword.json", "items/sword.json"]);
  });

  it("splits more than MAX_BATCH_SIZE paths into multiple parallel queries", async () => {
    const paths = Array.from({length: 75}, (_, i) => `items/item-${i}.json`);
    const queries = [];
    vi.stubGlobal("fetch", vi.fn((url, options = {}) => {
      if (url === "/github/token") return Promise.resolve(jsonResponse({token: "gho_test", repo_full_name: "nevinera/delve-content"}));
      const body = JSON.parse(options.body);
      queries.push(body.query);
      const fieldCount = body.query.match(/object\(expression:/g).length;
      const repository = {};
      for (let i = 0; i < fieldCount; i++) repository[`f${i}`] = {text: "{}"};
      return Promise.resolve(jsonResponse({data: {repository}}));
    }));

    const result = await fetchFilesBatch(paths);

    expect(queries).toHaveLength(2);
    expect(Object.keys(result)).toHaveLength(75);
  });

  it("throws on a GraphQL-level error", async () => {
    vi.stubGlobal("fetch", vi.fn((url) => {
      if (url === "/github/token") return Promise.resolve(jsonResponse({token: "gho_test", repo_full_name: "nevinera/delve-content"}));
      return Promise.resolve(jsonResponse({errors: [{message: "Something went wrong"}]}));
    }));

    await expect(fetchFilesBatch(["items/sword.json"])).rejects.toThrow("Something went wrong");
  });
});
