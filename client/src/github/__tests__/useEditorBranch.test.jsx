import {describe, it, expect, vi, beforeEach} from "vitest";
import {renderHook, waitFor, act} from "@testing-library/react";
import {useEditorBranch} from "../useEditorBranch";
import {rememberedBranch} from "../branchPreference";

function fakeClient(names) {
  return {
    listBranches: vi.fn(async () => names),
    defaultBranch: vi.fn(async () => "main"),
    createBranch: vi.fn(async (name) => names.push(name)),
  };
}

beforeEach(() => window.localStorage.clear());

describe("useEditorBranch", () => {
  it("starts on the default branch with nothing remembered", async () => {
    const {result} = renderHook(() => useEditorBranch(fakeClient(["main", "rework"])));
    await waitFor(() => expect(result.current.branch).toEqual("main"));
    expect(result.current.branches).toEqual(["main", "rework"]);
  });

  it("starts on the remembered branch while it exists", async () => {
    window.localStorage.setItem("delve.editor.branch", "rework");
    const {result} = renderHook(() => useEditorBranch(fakeClient(["main", "rework"])));
    await waitFor(() => expect(result.current.branch).toEqual("rework"));
  });

  it("remembers a picked or created branch", async () => {
    const client = fakeClient(["main"]);
    const {result} = renderHook(() => useEditorBranch(client));
    await waitFor(() => expect(result.current.branch).toEqual("main"));

    await act(async () => result.current.create("rework"));

    expect(client.createBranch).toHaveBeenCalledWith("rework");
    expect(result.current.branch).toEqual("rework");
    expect(result.current.branches).toEqual(["main", "rework"]);
    expect(rememberedBranch()).toEqual("rework");
  });
});
