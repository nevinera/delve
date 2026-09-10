import {describe, it, expect} from "vitest";
import {act, renderHook} from "@testing-library/react";
import {useValidateThenSave} from "../useValidateThenSave";

describe("useValidateThenSave", () => {
  it("starts with unknown validity and idle activity", () => {
    const {result} = renderHook(() => useValidateThenSave());

    expect(result.current.validity).toBe("unknown");
    expect(result.current.activity).toEqual({status: "idle"});
  });

  it("moves to valid/idle on setValid", () => {
    const {result} = renderHook(() => useValidateThenSave());

    act(() => result.current.setValid());

    expect(result.current.validity).toBe("valid");
    expect(result.current.activity).toEqual({status: "idle"});
  });

  it("moves to invalid, carrying the message, on setInvalid", () => {
    const {result} = renderHook(() => useValidateThenSave());

    act(() => result.current.setInvalid("name is required"));

    expect(result.current.validity).toBe("invalid");
    expect(result.current.activity).toEqual({status: "invalid", message: "name is required"});
  });

  it("markDirty resets validity to unknown after a valid result", () => {
    const {result} = renderHook(() => useValidateThenSave());
    act(() => result.current.setValid());

    act(() => result.current.markDirty());

    expect(result.current.validity).toBe("unknown");
  });

  it("a failed save does not reset validity - no revalidation needed to retry", () => {
    const {result} = renderHook(() => useValidateThenSave());
    act(() => result.current.setValid());

    act(() => result.current.setSaveError("network exploded"));

    expect(result.current.validity).toBe("valid");
    expect(result.current.activity).toEqual({status: "save_error", message: "network exploded"});
  });

  it("setSaved reports success without touching validity", () => {
    const {result} = renderHook(() => useValidateThenSave());
    act(() => result.current.setValid());

    act(() => result.current.setSaved());

    expect(result.current.validity).toBe("valid");
    expect(result.current.activity).toEqual({status: "success"});
  });
});
