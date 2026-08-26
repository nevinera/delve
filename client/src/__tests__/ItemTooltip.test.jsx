import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ItemTooltip } from "../App";

const ITEM = {
  name: "Sword of Testing",
  slot: "main_hand",
  elvl: 42,
  description: "A blade forged for coverage.",
  stats: { strength: 5, crit_rating: 3, agility: 0 },
};

describe("ItemTooltip", () => {
  it("always renders its children", () => {
    render(
      <ItemTooltip item={ITEM}>
        <span>Sword of Testing</span>
      </ItemTooltip>
    );
    expect(screen.getByText("Sword of Testing")).toBeInTheDocument();
  });

  it("hides the tooltip content until hovered", () => {
    render(
      <ItemTooltip item={ITEM}>
        <span>hover me</span>
      </ItemTooltip>
    );
    expect(screen.queryByText("A blade forged for coverage.")).not.toBeInTheDocument();
  });

  it("shows name, meta, non-zero stats, and description on hover", () => {
    render(
      <ItemTooltip item={ITEM}>
        <span>hover me</span>
      </ItemTooltip>
    );
    fireEvent.mouseEnter(screen.getByText("hover me"), { clientX: 100, clientY: 100 });

    expect(screen.getByText("e42 main_hand")).toBeInTheDocument();
    expect(screen.getByText("+5 Strength")).toBeInTheDocument();
    expect(screen.getByText("+3 Crit Rating")).toBeInTheDocument();
    expect(screen.getByText("A blade forged for coverage.")).toBeInTheDocument();
    expect(screen.queryByText(/Agility/)).not.toBeInTheDocument();
  });

  it("lists stats in the same Primary-then-Secondary order as the character screen", () => {
    const item = {
      name: "Sword of Testing",
      stats: { crit_rating: 3, versatility_rating: 1, strength: 5, stamina: 2 },
    };
    render(
      <ItemTooltip item={item}>
        <span>hover me</span>
      </ItemTooltip>
    );
    fireEvent.mouseEnter(screen.getByText("hover me"), { clientX: 100, clientY: 100 });

    const labels = screen.getAllByText(/^\+/).map(el => el.textContent);
    expect(labels).toEqual(["+5 Strength", "+2 Stamina", "+3 Crit Rating", "+1 Versatility Rating"]);
  });

  it("hides the tooltip again on mouse leave", () => {
    render(
      <ItemTooltip item={ITEM}>
        <span>hover me</span>
      </ItemTooltip>
    );
    const anchor = screen.getByText("hover me");
    fireEvent.mouseEnter(anchor, { clientX: 100, clientY: 100 });
    expect(screen.getByText("A blade forged for coverage.")).toBeInTheDocument();

    fireEvent.mouseLeave(anchor);
    expect(screen.queryByText("A blade forged for coverage.")).not.toBeInTheDocument();
  });

  it("renders children unwrapped when no item is given", () => {
    render(<ItemTooltip>{null}</ItemTooltip>);
    expect(document.body.textContent).toBe("");
  });
});
