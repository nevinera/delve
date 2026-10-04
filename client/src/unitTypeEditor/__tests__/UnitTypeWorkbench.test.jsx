import {describe, it, expect, vi, afterEach} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent, within} from "@testing-library/react";
import UnitTypeWorkbench from "../UnitTypeWorkbench";
import {estimateDamage} from "../estimateDamage";

vi.mock("../estimateDamage", () => ({
  estimateDamage: vi.fn(),
}));

// UnitTypePreviewPane mounts a real Three.js WebGLRenderer via
// AbilityPreviewCanvas, which jsdom can't back - stub it, exposing the
// powers it was given.
vi.mock("../UnitTypePreviewPane", () => ({
  default: ({unitTypeData}) => <div data-testid="preview-powers">{JSON.stringify(unitTypeData.powers)}</div>,
}));

const initialUnitType = {
  name: "Goblin Raider", description: "", tokenImageUrl: [], tokenRadius: 1.5,
  maxHP: 20, dps: 4.0, attackSpeed: 1.0,
  resource: {name: "energy", color: "888888", max: 100.0, defaultValue: 100.0, returnRate: 0.0, isFluid: true},
  targeting: {type: "aggroTable"}, tactics: {type: "randomAvailable"}, powers: [],
};

const slash = {name: "Slash", maxRange: 5, effects: [{type: "harm", affects: "bTarget", amount: 5}]};
const bleed = {name: "Bleed", shortName: "BLD", treatAs: "debuff", stacking: "replace", effects: []};
const rend = {name: "Rend", effects: [{type: "status", affects: "bTarget", duration: 6, status: bleed}]};

const stockAssets = {icons: {}, graphics: {}, sounds: {}};

// Hosted the way the world editor's unit-type level hosts it: data in
// state, nothing pending to upload.
async function renderReady(unitType = initialUnitType) {
  function Host() {
    const [data, setData] = useState(unitType);
    return (
      <UnitTypeWorkbench
        unitTypeKey="goblin-raider" data={data} onChange={setData}
        tokenImages={{options: [], urlFor: () => null, upload: async () => ""}}
        assetMap={{}}
        powerAssets={{overrides: {}, upload: vi.fn(), clear: vi.fn(), removeEntry: vi.fn(), removePower: vi.fn()}}
        importSources={{types: [], listSources: async () => [], loadPowers: async () => []}}
        stockAssets={stockAssets}
      />
    );
  }
  return render(<Host />);
}

function areaList() {
  return within(screen.getByRole("navigation", {name: "Unit type areas"}));
}

function breadcrumbs() {
  return within(screen.getByRole("navigation", {name: "Breadcrumb"}));
}

function previewPowers() {
  return JSON.parse(screen.getByTestId("preview-powers").textContent);
}

describe("UnitTypeWorkbench", () => {
  afterEach(() => vi.clearAllMocks());

  describe("layout", () => {
    it("starts on the unit's own config, with a one-crumb breadcrumb", async () => {
      await renderReady();

      expect(breadcrumbs().getByText("Goblin Raider")).toHaveAttribute("aria-current", "page");
      expect(screen.getByDisplayValue("Goblin Raider")).toBeInTheDocument();
    });

    it("flows a unit field edit into the draft and the area list", async () => {
      await renderReady();

      fireEvent.change(screen.getByDisplayValue("Goblin Raider"), {target: {value: "Goblin Brute"}});

      expect(areaList().getByRole("button", {name: /Goblin Brute/})).toBeInTheDocument();
    });

    it("lists each power, and opens one in the config pane when clicked", async () => {
      await renderReady({...initialUnitType, powers: [slash]});

      fireEvent.click(areaList().getByRole("button", {name: /Slash/}));

      expect(breadcrumbs().getByRole("button", {name: "Goblin Raider"})).toBeInTheDocument();
      expect(breadcrumbs().getByText("Slash")).toHaveAttribute("aria-current", "page");
      expect(screen.getByDisplayValue("Slash")).toBeInTheDocument();
    });

    it("goes back to the unit from the breadcrumb", async () => {
      await renderReady({...initialUnitType, powers: [slash]});
      fireEvent.click(areaList().getByRole("button", {name: /Slash/}));

      fireEvent.click(breadcrumbs().getByRole("button", {name: "Goblin Raider"}));

      expect(screen.getByDisplayValue("Goblin Raider")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("Slash")).not.toBeInTheDocument();
    });
  });

  describe("balance tags", () => {
    it("picks tags and shows the targets for them beside max HP and DPS", async () => {
      await renderReady({...initialUnitType, maxHP: 195, dps: 4});

      expect(screen.getByText("target 300")).toBeInTheDocument(); // untagged: assumed open, solo
      fireEvent.change(screen.getByRole("combobox", {name: "Pull size"}), {target: {value: "pair"}});
      fireEvent.click(screen.getByRole("checkbox", {name: "glass"}));

      expect(screen.getByText("target 98")).toHaveClass("target-off"); // 195 * 0.5
      expect(screen.getByText("target 6.7")).toBeInTheDocument(); // 5.13 * 1.3
      fireEvent.click(screen.getByRole("checkbox", {name: "tough"}));
      expect(screen.getByRole("checkbox", {name: "glass"})).not.toBeChecked();
      expect(screen.getByText("target 390")).toHaveClass("target-off");
    });
  });

  describe("powers", () => {
    it("adds a blank power and opens it", async () => {
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "+ New power"}));

      expect(previewPowers()).toHaveLength(1);
      expect(breadcrumbs().getByText("New Power")).toHaveAttribute("aria-current", "page");
    });

    it("edits a power inline", async () => {
      await renderReady({...initialUnitType, powers: [slash]});
      fireEvent.click(areaList().getByRole("button", {name: /Slash/}));

      fireEvent.change(screen.getByDisplayValue("Slash"), {target: {value: "Rake"}});

      expect(previewPowers()[0].name).toBe("Rake");
      expect(breadcrumbs().getByText("Rake")).toBeInTheDocument();
    });

    it("removes a power and returns to the unit", async () => {
      await renderReady({...initialUnitType, powers: [slash]});
      fireEvent.click(areaList().getByRole("button", {name: /Slash/}));

      fireEvent.click(screen.getByRole("button", {name: "Remove power"}));

      expect(previewPowers()).toEqual([]);
      expect(screen.getByDisplayValue("Goblin Raider")).toBeInTheDocument();
    });

    it("opens a power's status in its own pane, three crumbs deep", async () => {
      await renderReady({...initialUnitType, powers: [rend]});
      fireEvent.click(areaList().getByRole("button", {name: /Rend/}));

      fireEvent.click(screen.getByRole("button", {name: "Edit status ›"}));

      expect(breadcrumbs().getByRole("button", {name: "Rend"})).toBeInTheDocument();
      expect(breadcrumbs().getByText("Bleed")).toHaveAttribute("aria-current", "page");
      fireEvent.change(screen.getByDisplayValue("BLD"), {target: {value: "BLEED"}});
      expect(previewPowers()[0].effects[0].status.shortName).toBe("BLEED");
    });

    it("removes a status and goes back to its power", async () => {
      await renderReady({...initialUnitType, powers: [rend]});
      fireEvent.click(areaList().getByRole("button", {name: /Rend/}));
      fireEvent.click(screen.getByRole("button", {name: "Edit status ›"}));

      fireEvent.click(screen.getByRole("button", {name: "Remove status"}));

      expect(previewPowers()[0].effects[0].status).toBeNull();
      expect(breadcrumbs().getByText("Rend")).toHaveAttribute("aria-current", "page");
    });
  });

  describe("estimating damage", () => {
    const matrix = {results: [{gearingPlan: "offense", elevation: 0, dps: 3.9, ttdSeconds: 40.0}]};

    async function openEstimate() {
      fireEvent.click(areaList().getByRole("button", {name: /Damage estimate/}));
    }

    it("posts the draft and shows the matrix", async () => {
      estimateDamage.mockResolvedValue(matrix);
      await renderReady();
      await openEstimate();

      fireEvent.click(screen.getByRole("button", {name: "Estimate damage"}));

      await screen.findByText("3.9 dps");
      expect(estimateDamage).toHaveBeenCalledWith(expect.objectContaining({name: "Goblin Raider"}));
    });

    it("shows the error when the estimate fails", async () => {
      estimateDamage.mockRejectedValue(new Error("game server unavailable"));
      await renderReady();
      await openEstimate();

      fireEvent.click(screen.getByRole("button", {name: "Estimate damage"}));

      await screen.findByText("game server unavailable");
    });

    it("drops a shown estimate once the draft is edited", async () => {
      estimateDamage.mockResolvedValue(matrix);
      await renderReady();
      await openEstimate();
      fireEvent.click(screen.getByRole("button", {name: "Estimate damage"}));
      await screen.findByText("3.9 dps");

      fireEvent.click(areaList().getByRole("button", {name: /Goblin Raider/}));
      fireEvent.change(screen.getByDisplayValue("Goblin Raider"), {target: {value: "Goblin Brute"}});
      await openEstimate();

      expect(screen.queryByText("3.9 dps")).not.toBeInTheDocument();
    });
  });
});
