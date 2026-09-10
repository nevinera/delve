import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";
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
});
