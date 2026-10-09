import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuestLog } from "../QuestLog";

const zones = [
  {
    identifier: "cave",
    name: "The Cave",
    count: 2,
    quests: [{
      identifier: "rat-hunt",
      name: "Rat Hunt",
      description: "Rats!",
      timerSeconds: 300,
      timerStartedAt: Date.now() - 60_000,
      objectives: [
        {hash: "k", text: "Kill rats", count: 2, required: 5, map: "depths"},
        {hash: "t", text: "Talk to Grizzle", count: 0, required: 1, map: null},
      ],
      turnIn: null,
    }],
  },
  {
    identifier: "town",
    name: "Town",
    count: 1,
    quests: [{
      identifier: "delivery", name: "Delivery", description: "", timerSeconds: null, timerStartedAt: null,
      objectives: [{hash: "r", text: "Find the well", count: 0, required: 1, map: "square"}], turnIn: null,
    }],
  },
];
const currentNames = {maps: {depths: "The Depths"}, ncus: {}};

function renderLog(props = {}) {
  return render(<QuestLog open zones={zones} currentZone="cave" currentNames={currentNames} zonesUrl="/quests/zones" {...props} />);
}

describe("QuestLog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders nothing when closed", () => {
    renderLog({open: false});
    expect(document.body.textContent).toBe("");
  });

  it("says so when there are no quests", () => {
    renderLog({zones: []});
    expect(screen.getByText("No active quests.")).toBeInTheDocument();
  });

  it("lists zones with counts, with only the current zone open", () => {
    renderLog();
    expect(screen.getByRole("button", { name: /The Cave.*2/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Town.*1/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Rat Hunt")).toBeInTheDocument();
    expect(screen.getByText(/Kill rats: 2\/5/)).toBeInTheDocument();
    expect(screen.getByText("(The Depths)", {exact: false})).toBeInTheDocument();
    expect(screen.getByText("Talk to Grizzle")).toBeInTheDocument();
    expect(screen.getByText("Time left: 4:00")).toBeInTheDocument();
    expect(screen.queryByText("Delivery")).not.toBeInTheDocument();
  });

  it("opens another zone, naming its maps from Rails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({identifier: "town", name: "Town", map_names: {square: "Town Square"}}),
    });
    renderLog();
    fireEvent.click(screen.getByRole("button", { name: /Town/ }));
    expect(fetchMock).toHaveBeenCalledWith("/quests/zones/town");
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("(Town Square)", {exact: false})).toBeInTheDocument());
  });

  it("shows a turn-in, naming the NCU when it's known", () => {
    const turnIn = [{...zones[0], count: 1, quests: [{...zones[0].quests[0], objectives: [], turnIn: "grizzle", timerSeconds: null}]}];
    renderLog({zones: turnIn, currentNames: {maps: {}, ncus: {grizzle: "Grizzle"}}});
    expect(screen.getByText("Ready to turn in to Grizzle")).toBeInTheDocument();
  });

  it("abandons only after confirming", () => {
    const onAbandon = vi.fn();
    renderLog({onAbandon});
    fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(onAbandon).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
    fireEvent.click(screen.getByRole("button", { name: "Abandon Rat Hunt" }));
    expect(onAbandon).toHaveBeenCalledWith("rat-hunt");
  });
});
