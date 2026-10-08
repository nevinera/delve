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
    const offers = [
      { identifier: "rat-hunt", offerText: "Got any work?", description: "Clear out those rats.", marker: false },
      { identifier: "rat-king", offerText: "Heard of a rat king?", description: "Big one, down deep.", marker: true },
    ];

    it("lists offers by their offer text under the opening line, marking only marker quests", () => {
      render(<DialogueWindow name="Grizzle" dialogue={branching} offers={offers} onClose={() => {}} />);
      expect(screen.getByText("Choose one.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Got any work?" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "◆ Heard of a rat king?" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Path A" })).toBeInTheDocument();
    });

    it("only offers quests at the top of the conversation", () => {
      render(<DialogueWindow name="Grizzle" dialogue={branching} offers={offers} onClose={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Path A" }));
      expect(screen.queryByRole("button", { name: "Got any work?" })).not.toBeInTheDocument();
    });

    it("starts the quest on choosing it, with the description as the reply", () => {
      const onAcceptQuest = vi.fn();
      render(<DialogueWindow name="Grizzle" dialogue={branching} offers={offers} onAcceptQuest={onAcceptQuest} onClose={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Got any work?" }));
      expect(onAcceptQuest).toHaveBeenCalledWith("rat-hunt");
      expect(screen.getByText("Clear out those rats.")).toBeInTheDocument();
    });

    it("goes back to the conversation without the started quest", () => {
      render(<DialogueWindow name="Grizzle" dialogue={branching} offers={offers} onAcceptQuest={() => {}} onClose={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Got any work?" }));
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByText("Choose one.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Got any work?" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "◆ Heard of a rat king?" })).toBeInTheDocument();
    });

    it("lists offers alone for an NCU with no dialogue", () => {
      const onClose = vi.fn();
      render(<DialogueWindow name="Grizzle" dialogue={undefined} offers={offers} onClose={onClose} />);
      expect(screen.getByRole("button", { name: "Got any work?" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Goodbye" }));
      expect(onClose).toHaveBeenCalled();
    });

    it("still shows the reply for an NCU with no dialogue", () => {
      render(<DialogueWindow name="Grizzle" dialogue={undefined} offers={offers.slice(0, 1)} onAcceptQuest={() => {}} onClose={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Got any work?" }));
      expect(screen.getByText("Clear out those rats.")).toBeInTheDocument();
    });
  });

  describe("quest turn-ins", () => {
    const ready = { identifier: "deliver", name: "Delivery", ready: true, text: "Thanks!" };
    const unfinished = { identifier: "deliver", name: "Delivery", ready: false, text: "Well?" };

    it("completes a finished quest", () => {
      const onTurnInQuest = vi.fn();
      const onClose = vi.fn();
      render(<DialogueWindow name="Warden" dialogue={undefined} turnIns={[ready]} onTurnInQuest={onTurnInQuest} onClose={onClose} />);
      fireEvent.click(screen.getByRole("button", { name: /Delivery/ }));
      expect(screen.getByText("Thanks!")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Complete" }));
      expect(onTurnInQuest).toHaveBeenCalledWith("deliver");
      expect(onClose).toHaveBeenCalled();
    });

    it("shows progress text, with no way to complete, while unfinished", () => {
      render(<DialogueWindow name="Warden" dialogue={branching} turnIns={[unfinished]} onClose={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: /Delivery/ }));
      expect(screen.getByText("Well?")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Complete" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.getByText("Choose one.")).toBeInTheDocument();
    });
  });
});
