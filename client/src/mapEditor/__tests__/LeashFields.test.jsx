import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import LeashFields from "../LeashFields";

function renderFields(props = {}) {
  const onChange = vi.fn();
  render(
    <table><tbody>
      <LeashFields onChange={onChange} inheritLabel={{radius: "map's", hard: "Map's setting"}} {...props} />
    </tbody></table>
  );
  return onChange;
}

describe("LeashFields", () => {
  it("shows the inherited values as placeholders when blank", () => {
    renderFields();
    expect(screen.getByLabelText("Leash radius")).toHaveAttribute("placeholder", "map's");
    expect(screen.getByLabelText("Hard leash")).toHaveValue("");
  });

  it("sets and clears the radius", () => {
    const onChange = renderFields({leashRadius: 60});
    fireEvent.change(screen.getByLabelText("Leash radius"), {target: {value: "45"}});
    expect(onChange).toHaveBeenLastCalledWith({leashRadius: 45});
    fireEvent.change(screen.getByLabelText("Leash radius"), {target: {value: ""}});
    expect(onChange).toHaveBeenLastCalledWith({leashRadius: null});
  });

  it("sets hard leash on, off, or back to inherited", () => {
    const onChange = renderFields({hardLeash: true});
    expect(screen.getByLabelText("Hard leash")).toHaveValue("on");
    fireEvent.change(screen.getByLabelText("Hard leash"), {target: {value: "off"}});
    expect(onChange).toHaveBeenLastCalledWith({hardLeash: false});
    fireEvent.change(screen.getByLabelText("Hard leash"), {target: {value: ""}});
    expect(onChange).toHaveBeenLastCalledWith({hardLeash: null});
  });
});
