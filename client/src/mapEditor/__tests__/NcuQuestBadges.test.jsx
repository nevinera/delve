import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import NcuQuestBadges from "../NcuQuestBadges";

const dims = {pixelDimensions: {width: 100, height: 100}, feetDimensions: {width: 100, height: 100}};
const ncus = [
  {identifier: "grizzle", name: "Grizzle", position: {x: 10, y: 10}},
  {identifier: "warden", name: "Warden", position: {x: 50, y: 50}},
  {identifier: "idle", name: "Idle", position: {x: 80, y: 80}},
];
const questsByNcu = {
  grizzle: {offers: [{identifier: "rat-hunt", name: "Rat Hunt"}], turnIns: [{identifier: "rat-hunt", name: "Rat Hunt"}]},
  warden: {offers: [{identifier: "a", name: "Patrol"}], turnIns: [{identifier: "b", name: "Delivery"}]},
};

describe("NcuQuestBadges", () => {
  it("badges only NCUs with quests, opening a lone quest directly", () => {
    const onOpenQuest = vi.fn();
    render(<NcuQuestBadges ncus={ncus} questsByNcu={questsByNcu} onOpenQuest={onOpenQuest} {...dims} />);
    expect(screen.queryByLabelText("Quests for Idle")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Quests for Grizzle"));
    expect(onOpenQuest).toHaveBeenCalledWith("rat-hunt");
  });

  it("lists several quests to pick from", () => {
    const onOpenQuest = vi.fn();
    render(<NcuQuestBadges ncus={ncus} questsByNcu={questsByNcu} onOpenQuest={onOpenQuest} {...dims} />);
    fireEvent.click(screen.getByLabelText("Quests for Warden"));
    expect(onOpenQuest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Delivery"));
    expect(onOpenQuest).toHaveBeenCalledWith("b");
    expect(screen.queryByText("Patrol")).not.toBeInTheDocument();
  });
});
