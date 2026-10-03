import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent, within, waitFor} from "@testing-library/react";
import ImagePicker from "../ImagePicker";

const OPTIONS = [
  {value: "../tokens/a.webp", label: "a.webp", url: "url:a"},
  {value: "../tokens/b.webp", label: "b.webp", url: "url:b"},
];

function open() {
  fireEvent.click(screen.getByRole("button", {name: "Token Image"}));
  return within(screen.getByRole("dialog", {name: "Choose Token Image"}));
}

describe("ImagePicker", () => {
  it("shows the current image and name, and picks another from the grid", () => {
    const onChange = vi.fn();
    render(<ImagePicker label="Token Image" value="../tokens/a.webp" url="url:a" options={OPTIONS} onChange={onChange} />);

    expect(screen.getByRole("button", {name: "Token Image"})).toHaveTextContent("a.webp");
    const popover = open();
    expect(popover.getByRole("button", {name: "a.webp"})).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(popover.getByRole("button", {name: "b.webp"}));

    expect(onChange).toHaveBeenCalledWith("../tokens/b.webp");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears the image", () => {
    const onChange = vi.fn();
    render(<ImagePicker label="Token Image" value="../tokens/a.webp" options={OPTIONS} onChange={onChange} />);

    fireEvent.click(open().getByRole("button", {name: "Clear"}));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("uploads a file and picks what onUpload stored it as", async () => {
    const onChange = vi.fn();
    const onUpload = vi.fn(async () => "../tokens/ncu/new.png");
    render(<ImagePicker label="Token Image" value={undefined} options={[]} onChange={onChange} onUpload={onUpload} />);
    const popover = open();
    const file = new File(["x"], "new.png", {type: "image/png"});

    fireEvent.change(popover.getByLabelText("Upload Token Image"), {target: {files: [file]}});

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("../tokens/ncu/new.png"));
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("closes on Escape", () => {
    render(<ImagePicker label="Token Image" options={OPTIONS} onChange={vi.fn()} />);
    open();

    fireEvent.keyDown(document, {key: "Escape"});

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
