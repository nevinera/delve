import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ProvenanceRestrictionsField, {parseWorldKeys, withRestriction} from "../ProvenanceRestrictionsField";

describe("parseWorldKeys", () => {
  it("splits and trims, and treats blank as unset", () => {
    expect(parseWorldKeys(" a, b ,,c")).toEqual(["a", "b", "c"]);
    expect(parseWorldKeys("  ")).toBeNull();
  });
});

describe("withRestriction", () => {
  it("sets a key, keeping the others", () => {
    expect(withRestriction({maxElevation: 5}, "worlds", ["a"])).toEqual({maxElevation: 5, worlds: ["a"]});
  });

  it("drops a cleared key, and the whole object once empty", () => {
    expect(withRestriction({worlds: ["a"], maxElevation: 5}, "worlds", null)).toEqual({maxElevation: 5});
    expect(withRestriction({maxElevation: 5}, "maxElevation", null)).toBeNull();
  });
});

describe("ProvenanceRestrictionsField", () => {
  it("reports the worlds list when the field loses focus", () => {
    const onChange = vi.fn();
    render(<ProvenanceRestrictionsField value={null} onChange={onChange} worldsDefault="x" />);

    const input = screen.getByLabelText(/Other worlds allowed/);
    fireEvent.change(input, {target: {value: "demo, other"}});
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith({worlds: ["demo", "other"]});
  });

  it("reports the max elevation as an integer, null when cleared", () => {
    const onChange = vi.fn();
    render(<ProvenanceRestrictionsField value={{maxElevation: 4}} onChange={onChange} worldsDefault="x" />);

    const input = screen.getByLabelText("Max item elevation");
    expect(input).toHaveValue(4);
    fireEvent.change(input, {target: {value: "7"}});
    expect(onChange).toHaveBeenLastCalledWith({maxElevation: 7});
    fireEvent.change(input, {target: {value: ""}});
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
