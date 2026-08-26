import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LootWindow, unitHasLootClaim } from "../App";

const SELF = "unit-self";
const OTHER = "unit-other";

function item(overrides = {}) {
  return {
    name: "Sword of Testing",
    slot: "main_hand",
    elvl: 42,
    claims: [],
    ...overrides,
  };
}

describe("LootWindow", () => {
  it("renders nothing when items is empty or missing", () => {
    const { container: empty } = render(
      <LootWindow unitId="u1" items={[]} selfUnitId={SELF} onTake={() => {}} onClose={() => {}} />
    );
    expect(empty).toBeEmptyDOMElement();

    const { container: missing } = render(
      <LootWindow unitId="u1" items={undefined} selfUnitId={SELF} onTake={() => {}} onClose={() => {}} />
    );
    expect(missing).toBeEmptyDOMElement();
  });

  it("renders item name and meta", () => {
    render(
      <LootWindow unitId="u1" items={[item()]} selfUnitId={SELF} onTake={() => {}} onClose={() => {}} />
    );
    expect(screen.getByText("Sword of Testing")).toBeInTheDocument();
    expect(screen.getByText("e42")).toBeInTheDocument();
    expect(screen.getByText("main_hand")).toBeInTheDocument();
  });

  it("shows a Take button and no label when self's claim is available", () => {
    const items = [item({ claims: [{ character_unit_id: SELF, state: "available" }] })];
    render(<LootWindow unitId="u1" items={items} selfUnitId={SELF} onTake={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Take" })).toBeInTheDocument();
    expect(screen.queryByText(/^\(/)).not.toBeInTheDocument();
  });

  it.each([
    ["upgraded", "(upgraded)"],
    ["upgrade", "(upgrading...)"],
    ["locked_for_me", "(taking...)"],
    ["locked", "(locked)"],
    ["gone", "(gone)"],
    ["received", "(received)"],
  ])("shows label %s without a Take button", (state, label) => {
    const items = [item({ claims: [{ character_unit_id: SELF, state }] })];
    render(<LootWindow unitId="u1" items={items} selfUnitId={SELF} onTake={() => {}} onClose={() => {}} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take" })).not.toBeInTheDocument();
  });

  it("shows a strikethrough instead of an '(owned)' label for owned items", () => {
    const items = [item({ claims: [{ character_unit_id: SELF, state: "owned" }] })];
    render(<LootWindow unitId="u1" items={items} selfUnitId={SELF} onTake={() => {}} onClose={() => {}} />);
    expect(screen.queryByText("(owned)")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take" })).not.toBeInTheDocument();
    expect(screen.getByText("Sword of Testing")).toHaveStyle({ textDecoration: "line-through" });
  });

  it("shows no label and no Take button when self has no claim entry", () => {
    const items = [item({ claims: [{ character_unit_id: OTHER, state: "available" }] })];
    render(<LootWindow unitId="u1" items={items} selfUnitId={SELF} onTake={() => {}} onClose={() => {}} />);
    expect(screen.queryByText(/^\(/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take" })).not.toBeInTheDocument();
  });

  it("calls onTake with unitId and item index when Take is clicked", () => {
    const onTake = vi.fn();
    const items = [
      item({ name: "First", claims: [{ character_unit_id: SELF, state: "locked" }] }),
      item({ name: "Second", claims: [{ character_unit_id: SELF, state: "available" }] }),
    ];
    render(<LootWindow unitId="u42" items={items} selfUnitId={SELF} onTake={onTake} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Take" }));
    expect(onTake).toHaveBeenCalledWith("u42", 1);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<LootWindow unitId="u1" items={[item()]} selfUnitId={SELF} onTake={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("unitHasLootClaim", () => {
  it("returns false for missing or empty loot items", () => {
    expect(unitHasLootClaim(undefined, SELF)).toBe(false);
    expect(unitHasLootClaim([], SELF)).toBe(false);
  });

  it("returns false when no item has a claim for the given character", () => {
    const items = [item({ claims: [{ character_unit_id: OTHER, state: "available" }] })];
    expect(unitHasLootClaim(items, SELF)).toBe(false);
  });

  it("returns true when any item has a claim (any state) for the given character", () => {
    const items = [
      item({ claims: [{ character_unit_id: OTHER, state: "available" }] }),
      item({ claims: [{ character_unit_id: SELF, state: "locked" }] }),
    ];
    expect(unitHasLootClaim(items, SELF)).toBe(true);
  });

  it("returns false when an item has claims but none is a claims array", () => {
    const items = [item({ claims: undefined })];
    expect(unitHasLootClaim(items, SELF)).toBe(false);
  });
});
