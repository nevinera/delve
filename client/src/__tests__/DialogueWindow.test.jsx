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

  describe("quest offers", () => {
    const offers = [{ identifier: "rat-hunt", name: "Rat Hunt", offerText: "Clear out those rats." }];

    it("lists offers under the opening line", () => {
      render(<DialogueWindow name="Grizzle" dialogue={branching} offers={offers} onClose={() => {}} />);
      expect(screen.getByText("Choose one.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Rat Hunt/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Path A" })).toBeInTheDocument();
    });

    it("only offers quests at the top of the conversation", () => {
      render(<DialogueWindow name="Grizzle" dialogue={branching} offers={offers} onClose={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Path A" }));
      expect(screen.queryByRole("button", { name: /Rat Hunt/ })).not.toBeInTheDocument();
    });

    it("shows the offer text, and accepts", () => {
      const onAcceptQuest = vi.fn();
      const onClose = vi.fn();
      render(<DialogueWindow name="Grizzle" dialogue={branching} offers={offers} onAcceptQuest={onAcceptQuest} onClose={onClose} />);
      fireEvent.click(screen.getByRole("button", { name: /Rat Hunt/ }));
      expect(screen.getByText("Clear out those rats.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));
      expect(onAcceptQuest).toHaveBeenCalledWith("rat-hunt");
      expect(onClose).toHaveBeenCalled();
    });

    it("goes back to the conversation on Not now", () => {
      render(<DialogueWindow name="Grizzle" dialogue={branching} offers={offers} onClose={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: /Rat Hunt/ }));
      fireEvent.click(screen.getByRole("button", { name: "Not now" }));
      expect(screen.getByText("Choose one.")).toBeInTheDocument();
    });

    it("lists offers alone for an NCU with no dialogue", () => {
      const onClose = vi.fn();
      render(<DialogueWindow name="Grizzle" dialogue={undefined} offers={offers} onClose={onClose} />);
      expect(screen.getByRole("button", { name: /Rat Hunt/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Goodbye" }));
      expect(onClose).toHaveBeenCalled();
    });
  });
});
