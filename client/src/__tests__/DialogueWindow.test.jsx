import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DialogueWindow } from "../DialogueWindow";

const linear = {
  entry: [{ node: "first" }],
  nodes: {
    first: { text: "First.", next: "second" },
    second: { text: "Second." },
  },
};

const branching = {
  entry: [{ node: "greet" }],
  nodes: {
    greet: {
      text: "Choose one.",
      choices: [
        { text: "Path A", next: "a" },
        { text: "Path B", next: "b" },
      ],
    },
    a: { text: "You picked A." },
    b: { text: "You picked B." },
  },
};

describe("DialogueWindow", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders nothing without dialogue", () => {
    render(<DialogueWindow name="Scout" dialogue={undefined} onClose={() => {}} />);
    expect(document.body.textContent).toBe("");
  });

  it("steps through a linear chain, then closes from the terminal node", () => {
    const onClose = vi.fn();
    render(<DialogueWindow name="Scout" dialogue={linear} onClose={onClose} />);
    expect(screen.getByText("First.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Second.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Goodbye"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders one button per choice and advances to the picked branch", () => {
    render(<DialogueWindow name="Scout" dialogue={branching} onClose={() => {}} />);
    expect(screen.getByText("Choose one.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Path B"));
    expect(screen.getByText("You picked B.")).toBeInTheDocument();
  });

  it("closes from the X at any point", () => {
    const onClose = vi.fn();
    render(<DialogueWindow name="Scout" dialogue={linear} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("re-picks a random entry node on remount", () => {
    const multiEntry = {
      entry: [{ node: "a" }, { node: "b" }],
      nodes: { a: { text: "Greeting A." }, b: { text: "Greeting B." } },
    };
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const { unmount } = render(<DialogueWindow name="Scout" dialogue={multiEntry} onClose={() => {}} />);
    expect(screen.getByText("Greeting B.")).toBeInTheDocument();
    unmount();

    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<DialogueWindow name="Scout" dialogue={multiEntry} onClose={() => {}} />);
    expect(screen.getByText("Greeting A.")).toBeInTheDocument();
  });
});
