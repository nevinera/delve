import {combatStats} from "./combatStatsFixture";
import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {ClassSheet, statSummary} from "../ClassSheet";

const bolt = {
  name: "Bolt",
  description: "Zaps.",
  iconURL: "../icons/bolt.png",
  costType: "energy",
  costAmount: 30,
  castTime: null,
  globalCooldown: 1.5,
  cooldown: 3,
  maxRange: 5,
  effects: [{type: "harm", affects: "bTarget", amount: [2, 4], range: 5}],
};

describe("statSummary", () => {
  it("matches the Rails summary format", () => {
    expect(statSummary(bolt, combatStats())).toBe("30 energy · Instant · 1.5s GCD · 3s cooldown · 5 range");
  });

  it("shows a hasted cast time", () => {
    const slow = {...bolt, castTime: 3, costType: undefined, cooldown: undefined, maxRange: undefined, effects: [{type: "harm", school: "magic"}]};
    expect(statSummary(slow, combatStats({magic: {haste_pct: 50}}))).toBe("2s cast · 1.5s GCD");
  });
});

describe("ClassSheet", () => {
  const props = {powers: [bolt], combatStats: combatStats(), classConfigUrl: "http://x/classes/a.json", stockAssets: {}};

  it("renders nothing when closed", () => {
    const {container} = render(<ClassSheet open={false} {...props} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows icon, name, summary, description and effects", () => {
    render(<ClassSheet open {...props} onClose={() => {}} />);
    expect(screen.getByAltText("Bolt")).toHaveAttribute("src", "http://x/icons/bolt.png");
    expect(screen.getByText("Bolt")).toBeInTheDocument();
    expect(screen.getByText("Zaps.")).toBeInTheDocument();
    expect(screen.getByText(/30 energy · Instant/)).toBeInTheDocument();
    expect(screen.getByText("Deals 2-4 physical damage to the target (range 5)")).toBeInTheDocument();
  });

  it("shows the class name and description above the abilities", () => {
    render(<ClassSheet open {...props} className="Mage" classDescription="Casts spells." onClose={() => {}} />);
    const text = document.body.textContent;
    expect(screen.getByText("Mage")).toBeInTheDocument();
    expect(text.indexOf("Casts spells.")).toBeLessThan(text.indexOf("Abilities"));
    expect(text.indexOf("Abilities")).toBeLessThan(text.indexOf("Bolt"));
  });

  it("says so when there are no abilities", () => {
    render(<ClassSheet open {...props} powers={[]} onClose={() => {}} />);
    expect(screen.getByText("No abilities.")).toBeInTheDocument();
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(<ClassSheet open {...props} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close class"));
    expect(onClose).toHaveBeenCalled();
  });
});
