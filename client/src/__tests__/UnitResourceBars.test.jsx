import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UnitResourceBars } from "../App";

const unit = {
  resources: {
    energy: { current: 40, max: 100 },
    "combo points": { current: 2, max: 5 },
  },
};
const energy = { name: "energy", color: "FFDD00" };
const comboPoints = { name: "combo points", color: "CC3333", isFluid: false };

describe("UnitResourceBars", () => {
  for (const landscape of [false, true]) {
    describe(landscape ? "stacked (phone) layout" : "desktop layout", () => {
      it("renders the primary and secondary resource bars", () => {
        render(<UnitResourceBars unit={unit} primaryResource={energy} secondaryResources={[comboPoints]} landscape={landscape} />);
        expect(screen.getAllByTestId("resource-bar")).toHaveLength(2);
      });
    });
  }

  it("fills the primary bar to the current fraction", () => {
    render(<UnitResourceBars unit={unit} primaryResource={energy} />);
    expect(screen.getByTestId("resource-bar").firstChild.style.width).toEqual("40%");
  });

  it("renders one pip per point of a non-fluid secondary resource", () => {
    render(<UnitResourceBars unit={unit} primaryResource={null} secondaryResources={[comboPoints]} />);
    expect(screen.getByTestId("resource-bar").children).toHaveLength(5);
  });

  it("renders nothing for a unit without those resources", () => {
    render(<UnitResourceBars unit={{ resources: {} }} primaryResource={energy} secondaryResources={[comboPoints]} />);
    expect(screen.queryAllByTestId("resource-bar")).toHaveLength(0);
  });
});
