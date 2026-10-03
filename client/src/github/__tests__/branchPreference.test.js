import {describe, it, expect, beforeEach} from "vitest";
import {adoptBranchParam, rememberBranch, rememberedBranch} from "../branchPreference";

beforeEach(() => {
  document.cookie = "delve_editor_branch=; max-age=0; path=/";
});

describe("branchPreference", () => {
  it("remembers a branch in the cookie the server reads, slashes and all", () => {
    expect(rememberedBranch()).toBeNull();
    rememberBranch("rework/v2");
    expect(document.cookie).toContain("delve_editor_branch=rework%2Fv2");
    expect(rememberedBranch()).toEqual("rework/v2");
  });

  it("adopts ?branch= from the URL, then drops it", () => {
    window.history.replaceState(null, "", "/build/classes/puncher/edit?branch=rework#top");

    adoptBranchParam();

    expect(rememberedBranch()).toEqual("rework");
    expect(window.location.pathname + window.location.search + window.location.hash).toEqual("/build/classes/puncher/edit#top");
  });
});
