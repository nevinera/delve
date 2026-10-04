import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ColorField from "../ColorField";

describe("ColorField", () => {
  it("shows the current color in the picker", () => {
    render(<ColorField value="#FF8A3D" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Pick color")).toHaveValue("#ff8a3d");
  });

  it("keeps a leading # when the value has one, or is unset", () => {
    const onChange = vi.fn();
    render(<ColorField value={null} onChange={onChange} />);
    expect(screen.getByText("not set")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Pick color"), {target: {value: "#123456"}});

    expect(onChange).toHaveBeenCalledWith("#123456");
  });

  it("leaves off the # when the existing value has none", () => {
    const onChange = vi.fn();
    render(<ColorField value="888888" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Pick color"), {target: {value: "#123456"}});

    expect(onChange).toHaveBeenCalledWith("123456");
  });

  it("offers Clear only when clearable and set", () => {
    const onChange = vi.fn();
    const {rerender} = render(<ColorField value="#123456" onChange={onChange} />);
    expect(screen.queryByRole("button", {name: "Clear"})).not.toBeInTheDocument();

    rerender(<ColorField value="#123456" clearable onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", {name: "Clear"}));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
