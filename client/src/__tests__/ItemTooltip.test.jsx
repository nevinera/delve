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

    expect(screen.getByText("e42")).toBeInTheDocument();
    expect(screen.getByText("main_hand")).toBeInTheDocument();
    expect(screen.getByText("+5.0 Strength")).toBeInTheDocument();
    expect(screen.getByText("+3.0 Crit Rating")).toBeInTheDocument();
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
    expect(labels).toEqual(["+5.0 Strength", "+2.0 Stamina", "+3.0 Crit Rating", "+1.0 Versatility Rating"]);
  });

  it("scales stats by the elevation multiplier between the item and the local map", () => {
    // ee = item.elvl(42) - localElvl(52) = -10 -> em = 0.5
    const item = { name: "Sword of Testing", elvl: 42, stats: { strength: 10 } };
    render(
      <ItemTooltip item={item} localElvl={52}>
        <span>hover me</span>
      </ItemTooltip>
    );
    fireEvent.mouseEnter(screen.getByText("hover me"), { clientX: 100, clientY: 100 });
    expect(screen.getByText("+5.0 Strength")).toBeInTheDocument();
  });

  it.each([
    [-20, "#9d9d9d"], // delta -20 -> gray
    [-15, "#9d9d9d"], // delta -15 -> gray (boundary)
    [-10, "#1eff00"], // delta -10 -> green
    [-5, "#1eff00"],  // delta -5 -> green (boundary)
    [0, "#0070dd"],   // delta 0 -> blue
    [5, "#0070dd"],   // delta 5 -> blue (boundary)
    [10, "#a335ee"],  // delta 10 -> purple
    [15, "#a335ee"],  // delta 15 -> purple (boundary)
    [20, "#ff8000"],  // delta 20 -> orange
  ])("colors the elvl value for a %i elvl delta from local elevation", (delta, expectedColor) => {
    const item = { name: "Sword of Testing", elvl: 50 + delta };
    render(
      <ItemTooltip item={item} localElvl={50}>
        <span>hover me</span>
      </ItemTooltip>
    );
    fireEvent.mouseEnter(screen.getByText("hover me"), { clientX: 100, clientY: 100 });
    expect(screen.getByText(`e${50 + delta}`)).toHaveStyle({ color: expectedColor });
  });

  it("does not color the elvl value when localElvl is unknown", () => {
    render(
      <ItemTooltip item={ITEM}>
        <span>hover me</span>
      </ItemTooltip>
    );
    fireEvent.mouseEnter(screen.getByText("hover me"), { clientX: 100, clientY: 100 });
    expect(screen.getByText(`e${ITEM.elvl}`).style.color).toBe("");
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
