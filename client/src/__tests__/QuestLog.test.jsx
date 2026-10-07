import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QuestLog } from "../QuestLog";

const chains = [{
  identifier: "hunts",
  name: "Hunts",
  quests: [{
    identifier: "rat-hunt",
    name: "Rat Hunt",
    description: "Grizzle said: Rats!",
    timerSeconds: 300,
    timerStartedAt: Date.now() - 60_000,
    objectives: [{text: "Kill Rat", count: 2, required: 5}, {text: "Talk to Grizzle", count: 1, required: 1}],
  }],
}];

describe("QuestLog", () => {
  it("renders nothing when closed", () => {
    render(<QuestLog open={false} chains={chains} />);
    expect(document.body.textContent).toBe("");
  });

  it("says so when there are no quests", () => {
    render(<QuestLog open chains={[]} />);
    expect(screen.getByText("No active quests.")).toBeInTheDocument();
  });

  it("shows quests by chain with progress", () => {
    render(<QuestLog open chains={chains} />);
    expect(screen.getByText("Hunts")).toBeInTheDocument();
    expect(screen.getByText("Rat Hunt")).toBeInTheDocument();
    expect(screen.getByText("Grizzle said: Rats!")).toBeInTheDocument();
    expect(screen.getByText("Kill Rat: 2/5")).toBeInTheDocument();
    expect(screen.getByText("Talk to Grizzle: 1/1")).toBeInTheDocument();
    expect(screen.getByText("Time left: 4:00")).toBeInTheDocument();
  });

  it("abandons only after confirming", () => {
    const onAbandon = vi.fn();
    render(<QuestLog open chains={chains} onAbandon={onAbandon} />);
    fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(onAbandon).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
    fireEvent.click(screen.getByRole("button", { name: "Abandon Rat Hunt" }));
    expect(onAbandon).toHaveBeenCalledWith("rat-hunt");
  });
});
