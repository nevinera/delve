import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent, within} from "@testing-library/react";
import ClassSurvivabilityPanel from "../ClassSurvivabilityPanel";

function cell(overrides) {
  return {
    priority: "dps", intendedFor: "open", pull: "solo", school: "physical", elevation: 0,
    hpLostPct: 21, fightSeconds: 12, cleared: true, died: false, ttd: 58, survives: false, capSeconds: 300,
    ...overrides,
  };
}

const estimate = {
  results: [
    cell({}),
    cell({elevation: -5, hpLostPct: 31, ttd: 30}),
    cell({priority: "tank", survives: true, hpLostPct: 10}),
    cell({priority: "tank", elevation: -10, hpLostPct: 120, died: true, ttd: 20}),
    cell({school: "magic", hpLostPct: 77}),
    cell({intendedFor: "g1", hpLostPct: 66}),
    cell({pull: "swarm", hpLostPct: 99}),
  ],
};

function renderPanel(props = {}) {
  return render(<ClassSurvivabilityPanel estimate={null} estimating={false} error={null} onEstimate={() => {}} {...props} />);
}

describe("ClassSurvivabilityPanel", () => {
  it("shows just the button before any estimate", () => {
    renderPanel();

    expect(screen.getByRole("button", {name: "Estimate survivability"})).toBeEnabled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("calls onEstimate, disables while estimating, and shows errors", () => {
    const onEstimate = vi.fn();
    const { unmount } = renderPanel({onEstimate});
    fireEvent.click(screen.getByRole("button", {name: "Estimate survivability"}));
    expect(onEstimate).toHaveBeenCalled();
    unmount();

    renderPanel({estimating: true, error: "game server unavailable"});
    expect(screen.getByRole("button", {name: "Estimating…"})).toBeDisabled();
    expect(screen.getByText("game server unavailable")).toBeInTheDocument();
  });

  it("shows a table per priority for the default open / physical / solo pull, highest elevation first", () => {
    renderPanel({estimate});

    expect(screen.getByRole("heading", {name: "dps gear"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "tank gear"})).toBeInTheDocument();
    const [dpsTable] = screen.getAllByRole("table");
    const rows = within(dpsTable).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["+0", "-5"]);
    expect(within(rows[0]).getByText("58.0s")).toBeInTheDocument();
    expect(within(rows[0]).getByText("21%")).toBeInTheDocument();
    expect(within(rows[0]).getByText("target 60.0s")).toBeInTheDocument();
    expect(within(rows[0]).getByText("target 20%")).toBeInTheDocument();
  });

  it("shows survives and dies, and colors a tank that survives at ee 0 as on target", () => {
    renderPanel({estimate});
    const tankTable = screen.getAllByRole("table")[1];
    const [ee0, eeMinus10] = [...tankTable.querySelectorAll("tbody tr")];

    expect(within(ee0).getByText("survives 300s+").closest("td")).toHaveClass("target-on");
    expect(within(eeMinus10).getByText("dies")).toBeInTheDocument();
  });

  it("flags surviving where that is not the goal as too tanky", () => {
    renderPanel({estimate: {results: [cell({survives: true})]}});

    expect(screen.getByText("survives 300s+").closest("td")).toHaveClass("target-tanky");
  });

  it("switches the shown cells with the selectors", () => {
    renderPanel({estimate});

    fireEvent.change(screen.getByLabelText("Damage"), {target: {value: "magic"}});
    expect(screen.getByText("77%")).toBeInTheDocument();
    expect(screen.queryByText("21%")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Damage"), {target: {value: "physical"}});
    fireEvent.change(screen.getByLabelText("Content"), {target: {value: "g1"}});
    expect(screen.getByText("66%")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Content"), {target: {value: "open"}});
    fireEvent.change(screen.getByLabelText("Pull"), {target: {value: "swarm"}});
    expect(screen.getByText("99%")).toBeInTheDocument();
  });
});
