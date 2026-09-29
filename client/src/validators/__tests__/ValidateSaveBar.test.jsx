import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ValidateSaveBar from "../ValidateSaveBar";

describe("ValidateSaveBar", () => {
  it("disables Save when validity is unknown", () => {
    render(<ValidateSaveBar validity="unknown" activity={{status: "idle"}} onValidate={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Validate"})).not.toBeDisabled();
  });

  it("enables Save when validity is valid", () => {
    render(<ValidateSaveBar validity="valid" activity={{status: "idle"}} onValidate={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled();
  });

  it("disables both buttons and shows a validating label while validating", () => {
    render(<ValidateSaveBar validity="unknown" activity={{status: "validating"}} onValidate={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole("button", {name: "Validating…"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
  });

  it("disables both buttons and shows a saving label while saving", () => {
    render(<ValidateSaveBar validity="valid" activity={{status: "saving"}} onValidate={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByRole("button", {name: "Validate"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Saving…"})).toBeDisabled();
  });

  it("shows the error message for an invalid result", () => {
    render(<ValidateSaveBar validity="invalid" activity={{status: "invalid", message: "name is required"}} onValidate={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByText("name is required")).toBeInTheDocument();
  });

  it("shows the error message for a failed save", () => {
    render(<ValidateSaveBar validity="valid" activity={{status: "save_error", message: "network exploded"}} onValidate={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByText("network exploded")).toBeInTheDocument();
  });

  it("shows a success message after saving", () => {
    render(<ValidateSaveBar validity="valid" activity={{status: "success"}} onValidate={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });

  it("calls onSave straight away when there is no defaultMessage", () => {
    const onSave = vi.fn();
    render(<ValidateSaveBar validity="valid" activity={{status: "idle"}} onValidate={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    expect(onSave).toHaveBeenCalledWith();
  });

  it("asks for a commit message prefilled with the default, then saves with it", () => {
    const onSave = vi.fn();
    render(<ValidateSaveBar validity="valid" activity={{status: "idle"}} onValidate={vi.fn()} onSave={onSave} defaultMessage="Update Foo" />);

    fireEvent.click(screen.getByRole("button", {name: "Save"}));
    expect(onSave).not.toHaveBeenCalled();
    const input = screen.getByLabelText("Commit message");
    expect(input).toHaveValue("Update Foo");

    fireEvent.change(input, {target: {value: "Tweak Foo"}});
    fireEvent.click(screen.getByRole("button", {name: "Commit"}));

    expect(onSave).toHaveBeenCalledWith("Tweak Foo");
    expect(screen.queryByLabelText("Commit message")).not.toBeInTheDocument();
  });

  it("falls back to the default when the message is blank", () => {
    const onSave = vi.fn();
    render(<ValidateSaveBar validity="valid" activity={{status: "idle"}} onValidate={vi.fn()} onSave={onSave} defaultMessage="Update Foo" />);

    fireEvent.click(screen.getByRole("button", {name: "Save"}));
    fireEvent.change(screen.getByLabelText("Commit message"), {target: {value: "  "}});
    fireEvent.click(screen.getByRole("button", {name: "Commit"}));

    expect(onSave).toHaveBeenCalledWith("Update Foo");
  });

  it("does not save when the prompt is cancelled", () => {
    const onSave = vi.fn();
    render(<ValidateSaveBar validity="valid" activity={{status: "idle"}} onValidate={vi.fn()} onSave={onSave} defaultMessage="Update Foo" />);

    fireEvent.click(screen.getByRole("button", {name: "Save"}));
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Commit message")).not.toBeInTheDocument();
  });
});
