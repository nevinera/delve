import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import DialogueFields from "../DialogueFields";

describe("DialogueFields", () => {
  it("reorders, appends, and edits lines", () => {
    const onChange = vi.fn();
    render(<DialogueFields lines={["Hi.", "Bye."]} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("Move line 2 up"));
    expect(onChange).toHaveBeenLastCalledWith(["Bye.", "Hi."]);

    fireEvent.click(screen.getByText("+ Add Line"));
    expect(onChange).toHaveBeenLastCalledWith(["Hi.", "Bye.", ""]);

    fireEvent.change(screen.getByLabelText("Dialogue line 2"), {target: {value: "Later."}});
    expect(onChange).toHaveBeenLastCalledWith(["Hi.", "Later."]);
  });

  it("drops the field entirely once the last line is removed", () => {
    const onChange = vi.fn();
    render(<DialogueFields lines={["Hi."]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Remove line 1"));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("disables moving past either end", () => {
    render(<DialogueFields lines={["Hi.", "Bye."]} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Move line 1 up")).toBeDisabled();
    expect(screen.getByLabelText("Move line 2 down")).toBeDisabled();
  });
});
