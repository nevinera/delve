import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import UnitsPanel from "../UnitsPanel";

function noop() {}

const AVAILABLE_UNIT_TYPE_KEYS = ["goblin-raider", "slime"];
const UNIT_TYPE_DETAILS = {
  "goblin-raider": {name: "Goblin Raider", tokenImageUrl: "data:image/webp;base64,AAAA"},
  slime: {name: "Slime", tokenImageUrl: null},
};
const AVAILABLE_ITEM_KEYS = ["sword-of-doom", "iron-shield"];
const ITEM_DETAILS = {
  "sword-of-doom": {identifier: "sword-of-doom", name: "Sword of Doom", slot: "main_hand"},
  "iron-shield": {identifier: "iron-shield", name: "Iron Shield", slot: "off_hand"},
};

const DEFAULT_PROPS = {
  selectedIndex: null, onSelect: noop, onHover: noop,
  availableUnitTypeKeys: AVAILABLE_UNIT_TYPE_KEYS, unitTypeDetails: UNIT_TYPE_DETAILS, onChooseUnitType: noop,
  newUnitTypeUrl: "/build/unit_types/new",
  availableItemKeys: AVAILABLE_ITEM_KEYS, itemDetails: ITEM_DETAILS, onChooseItem: noop, newItemUrl: "/build/items/new",
  onRefresh: noop, refreshStatus: "",
  tool: "select", placement: null, canPlaceOnMap: true, pendingUnitType: null, onStartAddUnit: noop,
  unitPlacement: null, onStartUnitPlacement: noop, dispatch: noop,
};

function expandSection() {
  fireEvent.click(document.querySelector(".map-sidebar-section-heading"));
}

// A unit's own row is collapsed by default (name/type/token/loot-icon only)
// - most tests need it open to reach the editing form/loot table.
function expandUnitRow(i = 0) {
  fireEvent.click(document.querySelectorAll(".map-unit-row")[i]);
}

describe("UnitsPanel", () => {
  it("starts collapsed, showing only the section heading", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);

    expect(screen.getByText("Units (1)")).toBeInTheDocument();
    expect(screen.queryByText(/Unit 1:/)).not.toBeInTheDocument();
  });

  it("shows a placeholder when there are no units yet, once expanded", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} />);
    expandSection();
    expect(screen.getByText(/No units yet/)).toBeInTheDocument();
  });

  it("lists the unit type dropdown with real available unit types", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} />);
    expandSection();

    expect(screen.getByRole("option", {name: "Goblin Raider"})).toBeInTheDocument();
    expect(screen.getByRole("option", {name: "Slime"})).toBeInTheDocument();
  });

  it("disables '+ Add Unit' until a unit type is chosen", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} />);
    expandSection();

    expect(screen.getByRole("button", {name: "+ Add Unit"})).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "goblin-raider"}});
    expect(screen.getByRole("button", {name: "+ Add Unit"})).not.toBeDisabled();
  });

  it("starts add-unit mode with the chosen unit type, without dispatching anything itself", () => {
    const dispatch = vi.fn();
    const onStartAddUnit = vi.fn();
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} dispatch={dispatch} onStartAddUnit={onStartAddUnit} />);
    expandSection();

    fireEvent.change(screen.getByRole("combobox"), {target: {value: "slime"}});
    fireEvent.click(screen.getByRole("button", {name: "+ Add Unit"}));

    expect(onStartAddUnit).toHaveBeenCalledWith("slime");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("disables '+ Add Unit' while any tool/placement is active, or with no feetDimensions", () => {
    const {rerender} = render(<UnitsPanel {...DEFAULT_PROPS} units={[]} tool="add-circle" />);
    expandSection();
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "slime"}});
    expect(screen.getByRole("button", {name: "+ Add Unit"})).toBeDisabled();

    rerender(<UnitsPanel {...DEFAULT_PROPS} units={[]} tool="select" placement={{barrierIndex: 0, pointIndex: 0}} />);
    expect(screen.getByRole("button", {name: "+ Add Unit"})).toBeDisabled();

    rerender(<UnitsPanel {...DEFAULT_PROPS} units={[]} tool="select" placement={null} canPlaceOnMap={false} />);
    expect(screen.getByRole("button", {name: "+ Add Unit"})).toBeDisabled();
    expect(screen.getByText(/Set feet dimensions/)).toBeInTheDocument();
  });

  it("shows a pending placeholder entry while add-unit is armed, labeled with the pending unit type", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} tool="add-unit" pendingUnitType="goblin-raider" />);
    expandSection();

    expect(screen.getByText(/Unit 1: Goblin Raider/)).toBeInTheDocument();
    expect(screen.getByText("(placing…)")).toBeInTheDocument();
    expect(screen.queryByText(/No units yet/)).not.toBeInTheDocument();
  });

  it("collapses each unit into a row with just its name, type, and token - no loot icon without loot", () => {
    const units = [{unitType: "goblin-raider", identifier: "goblin_a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();

    expect(document.querySelector(".map-unit-row-name")).toHaveTextContent("goblin_a");
    expect(document.querySelector(".map-unit-row-type")).toHaveTextContent("Goblin Raider");
    expect(document.querySelector(".map-unit-row-token")).toBeInTheDocument();
    expect(document.querySelector(".map-unit-row-loot-icon")).not.toBeInTheDocument();
    // Collapsed - the editing form/loot table/Remove button aren't rendered yet.
    expect(document.querySelector(".map-unit-body")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Remove"})).not.toBeInTheDocument();
  });

  it("falls back to 'Unit N' as the row name when a unit has no identifier yet", () => {
    const units = [{unitType: "goblin-raider", identifier: null, position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();

    expect(document.querySelector(".map-unit-row-name")).toHaveTextContent("Unit 1");
  });

  it("shows a 💰 loot icon on the row only when the unit has loot entries", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, lootTable: {"sword-of-doom": 1}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();

    expect(document.querySelector(".map-unit-row-loot-icon")).toHaveTextContent("💰");
  });

  it("expands a unit's row on click, revealing the editing form, and collapses it again on a second click", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();

    expect(document.querySelector(".map-unit-body")).not.toBeInTheDocument();
    expandUnitRow();
    expect(document.querySelector(".map-unit-body")).toBeInTheDocument();
    expandUnitRow();
    expect(document.querySelector(".map-unit-body")).not.toBeInTheDocument();
  });

  it("expands multiple units' rows independently - opening one doesn't close another", () => {
    const units = [
      {unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
      {unitType: "slime", identifier: "b", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
    ];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();

    expandUnitRow(0);
    expandUnitRow(1);

    expect(document.querySelectorAll(".map-unit-body")).toHaveLength(2);
  });

  it("lists each unit with its type label, identifier field, and HP slider, once expanded", () => {
    const units = [{unitType: "goblin-raider", identifier: "goblin_a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 0.5, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();
    expandUnitRow();

    expect(screen.getByDisplayValue("goblin_a")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows a unit's real token image in its own panel beside the editing form, once expanded", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();
    expandUnitRow();

    const body = document.querySelector(".map-unit-body");
    expect(body).toBeInTheDocument();
    expect(body.querySelector("table")).toBeInTheDocument();
    const panel = body.querySelector(".map-unit-token-panel");
    expect(panel).toBeInTheDocument();
    expect(panel.querySelector("img.map-unit-token-thumb")).toHaveAttribute("src", "data:image/webp;base64,AAAA");
  });

  it("falls back to a plain hostility-colored dot when the unit type has no tokenImageUrl", () => {
    const units = [{unitType: "slime", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();
    expandUnitRow();

    expect(document.querySelector(".map-unit-token-panel img")).not.toBeInTheDocument();
    expect(document.querySelector(".map-unit-token-panel .map-unit-token-thumb-fallback")).toBeInTheDocument();
  });

  it("shows a unit's position as a clickable coordinate pill that starts position placement", () => {
    const onStartUnitPlacement = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 12.34, y: 8, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} onStartUnitPlacement={onStartUnitPlacement} />);
    expandSection();
    expandUnitRow();

    fireEvent.click(screen.getByRole("button", {name: "12.3, 8"}));

    expect(onStartUnitPlacement).toHaveBeenCalledWith(0);
  });

  it("shows a pending '…' on the position pill while placing, and disables it", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} unitPlacement={{unitIndex: 0}} />);
    expandSection();
    expandUnitRow();

    const pending = screen.getByRole("button", {name: "…"});
    expect(pending).toBeDisabled();
    expect(screen.queryByRole("button", {name: "0, 0"})).not.toBeInTheDocument();
  });

  it("disables '+ Add Unit' while a unit's position is being placed", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} unitPlacement={{unitIndex: 0}} />);
    expandSection();

    fireEvent.change(screen.getByRole("combobox"), {target: {value: "slime"}});
    expect(screen.getByRole("button", {name: "+ Add Unit"})).toBeDisabled();
  });

  it("falls back to the raw unitType key when it's not in availableUnitTypes", () => {
    const units = [{unitType: "unknown-type", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();

    expect(document.querySelector(".map-unit-row-type")).toHaveTextContent("unknown-type");
  });

  it("edits a unit's type via the dropdown", () => {
    const dispatch = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
    expandSection();
    expandUnitRow();

    const selects = screen.getAllByRole("combobox");
    const typeSelect = selects.find((el) => el.closest(".map-unit-body"));
    fireEvent.change(typeSelect, {target: {value: "slime"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "unitType", value: "slime",
    });
  });

  it("shows a unit's current type as a distinctly-labeled extra option when it's not a real unit type, without losing it", () => {
    const units = [{unitType: "goblin", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();
    expandUnitRow();

    expect(screen.getByRole("option", {name: "goblin (not a real unit type)"})).toBeInTheDocument();
    const selects = screen.getAllByRole("combobox");
    const typeSelect = selects.find((el) => el.closest(".map-unit-body"));
    expect(typeSelect).toHaveValue("goblin");
  });

  it("edits a unit's identifier", () => {
    const dispatch = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "old", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
    expandSection();
    expandUnitRow();

    fireEvent.change(screen.getByDisplayValue("old"), {target: {value: "new_id"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "identifier", value: "new_id",
    });
  });

  it("edits a unit's HP via the slider", () => {
    const dispatch = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
    expandSection();
    expandUnitRow();

    fireEvent.change(screen.getByRole("slider"), {target: {value: "0.25"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "currentHpFraction", value: 0.25,
    });
  });

  it("calls onHover on mouse enter/leave of an entry", () => {
    const onHover = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} onHover={onHover} />);
    expandSection();

    const entry = document.querySelector(".entry-block");
    fireEvent.mouseEnter(entry);
    expect(onHover).toHaveBeenCalledWith(0);
    fireEvent.mouseLeave(entry);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it("highlights a row when hoveredIndex matches it (e.g. hovering its token on the map)", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} hoveredIndex={0} />);
    expandSection();

    expect(document.querySelector(".entry-block")).toHaveClass("map-entry-hovered");
  });

  it("removes a unit, clearing selection if it was selected", () => {
    const dispatch = vi.fn();
    const onSelect = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} selectedIndex={0} onSelect={onSelect} dispatch={dispatch} />);
    expandSection();
    expandUnitRow();

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));

    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_ENTRY", section: "units", index: 0});
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("opens a unit's row exclusively, closing others, and scrolls it into view when focusUnitRequest targets it", () => {
    const units = [
      {unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
      {unitType: "slime", identifier: "b", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
    ];
    const {rerender} = render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    // Section starts collapsed, and both rows are opened directly by hand.
    expandSection();
    expandUnitRow(0);
    expandUnitRow(1);
    expect(document.querySelectorAll(".map-unit-body")).toHaveLength(2);

    const scrollIntoView = vi.fn();
    document.querySelectorAll(".map-unit-block").forEach((el) => { el.scrollIntoView = scrollIntoView; });
    rerender(<UnitsPanel {...DEFAULT_PROPS} units={units} focusUnitRequest={{index: 1, nonce: 1}} />);

    const bodies = document.querySelectorAll(".map-unit-body");
    expect(bodies).toHaveLength(1);
    expect(document.querySelectorAll(".map-unit-block")[1].querySelector(".map-unit-body")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  describe("loot table", () => {
    function unitWithLoot(lootTable) {
      return {unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, lootTable};
    }

    it("shows a placeholder when a unit has no loot yet", () => {
      render(<UnitsPanel {...DEFAULT_PROPS} units={[unitWithLoot(undefined)]} />);
      expandSection();
      expandUnitRow();

      expect(screen.getByText("No loot yet.")).toBeInTheDocument();
    });

    it("lists each loot entry with its resolved item name and weight", () => {
      const units = [unitWithLoot({"sword-of-doom": 3})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
      expandSection();
      expandUnitRow();

      expect(screen.getByText("Sword of Doom")).toBeInTheDocument();
      expect(screen.getByDisplayValue("3")).toBeInTheDocument();
    });

    it("adds a new loot entry at weight 1, keyed by the item's own identifier", () => {
      const dispatch = vi.fn();
      const units = [unitWithLoot({})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
      expandSection();
      expandUnitRow();

      // Two comboboxes exist (unit type + loot item) - find the one offering items.
      const itemSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="sword-of-doom"]'));
      fireEvent.change(itemSelect, {target: {value: "sword-of-doom"}});
      fireEvent.click(screen.getByRole("button", {name: "+ Add Loot Entry"}));

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "lootTable", value: {"sword-of-doom": 1},
      });
    });

    it("does not offer an item that's already in the loot table", () => {
      const units = [unitWithLoot({"sword-of-doom": 1})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
      expandSection();
      expandUnitRow();

      const itemSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="iron-shield"]'));
      expect(itemSelect.querySelector('option[value="sword-of-doom"]')).not.toBeInTheDocument();
      expect(itemSelect.querySelector('option[value="iron-shield"]')).toBeInTheDocument();
    });

    it("edits a loot entry's weight", () => {
      const dispatch = vi.fn();
      const units = [unitWithLoot({"sword-of-doom": 1})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
      expandSection();
      expandUnitRow();

      fireEvent.change(document.querySelector(".map-loot-entry input"), {target: {value: "5"}});

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "lootTable", value: {"sword-of-doom": 5},
      });
    });

    it("removes a loot entry", () => {
      const dispatch = vi.fn();
      const units = [unitWithLoot({"sword-of-doom": 1, "iron-shield": 2})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
      expandSection();
      expandUnitRow();

      fireEvent.click(document.querySelector(".map-loot-entry-remove"));

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "lootTable", value: {"iron-shield": 2},
      });
    });

    it("requests item details when an item is chosen from the dropdown", () => {
      const onChooseItem = vi.fn();
      const units = [unitWithLoot({})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} onChooseItem={onChooseItem} />);
      expandSection();
      expandUnitRow();

      const itemSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="sword-of-doom"]'));
      fireEvent.change(itemSelect, {target: {value: "sword-of-doom"}});

      expect(onChooseItem).toHaveBeenCalledWith("sword-of-doom");
    });

    it("defaults the loot count field to 1 when unset", () => {
      const units = [unitWithLoot({"sword-of-doom": 1})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
      expandSection();
      expandUnitRow();

      expect(document.querySelector(".map-loot-count-field input").value).toBe("1");
    });

    it("edits the loot count field", () => {
      const dispatch = vi.fn();
      const units = [unitWithLoot({"sword-of-doom": 1})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
      expandSection();
      expandUnitRow();

      fireEvent.change(document.querySelector(".map-loot-count-field input"), {target: {value: "0.25"}});

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "lootCount", value: 0.25,
      });
    });
  });

  it("calls onRefresh from the shared Refresh button, and shows refreshStatus", () => {
    const onRefresh = vi.fn();
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} onRefresh={onRefresh} refreshStatus="Refreshed." />);
    expandSection();

    fireEvent.click(screen.getByRole("button", {name: "Refresh"}));

    expect(onRefresh).toHaveBeenCalled();
    expect(screen.getByText("Refreshed.")).toBeInTheDocument();
  });

  it("links '+ New Unit Type' to newUnitTypeUrl, and '+ New Item' to newItemUrl, both opening in a new tab", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} newUnitTypeUrl="/build/unit_types/new" newItemUrl="/build/items/new" />);
    expandSection();

    const unitTypeLink = screen.getByRole("link", {name: "+ New Unit Type"});
    expect(unitTypeLink).toHaveAttribute("href", "/build/unit_types/new");
    expect(unitTypeLink).toHaveAttribute("target", "_blank");

    const itemLink = screen.getByRole("link", {name: "+ New Item"});
    expect(itemLink).toHaveAttribute("href", "/build/items/new");
    expect(itemLink).toHaveAttribute("target", "_blank");
  });

  describe("groups", () => {
    function unit(overrides) {
      return {unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, ...overrides};
    }

    it("encloses units sharing a groupIdentifier in one group block instead of flat rows", () => {
      const units = [
        unit({identifier: "a", groupIdentifier: "pack"}),
        unit({identifier: "b"}),
        unit({identifier: "b2", groupIdentifier: "pack"}),
      ];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
      expandSection();

      expect(document.querySelectorAll(".map-unit-group-block")).toHaveLength(1);
      expect(document.querySelector(".map-unit-group-count")).toHaveTextContent("(2)");
      // The ungrouped unit stays a flat row.
      expect(document.querySelectorAll(".map-unit-group-block .map-unit-row")).toHaveLength(2);
    });

    it("submits '+ Add Group' with the typed name and clears the field", () => {
      const onAddPendingGroup = vi.fn();
      render(<UnitsPanel {...DEFAULT_PROPS} units={[]} onAddPendingGroup={onAddPendingGroup} />);
      expandSection();

      fireEvent.change(screen.getByPlaceholderText("New group name…"), {target: {value: "goblin pack"}});
      fireEvent.click(screen.getByRole("button", {name: "+ Add Group"}));

      expect(onAddPendingGroup).toHaveBeenCalledWith("goblin pack");
      expect(screen.getByPlaceholderText("New group name…")).toHaveValue("");
    });

    it("shows a pending (memberless) group from pendingGroupNames", () => {
      render(<UnitsPanel {...DEFAULT_PROPS} units={[]} pendingGroupNames={["new pack"]} />);
      expandSection();

      expect(document.querySelector(".map-unit-group-block")).toBeInTheDocument();
      expect(document.querySelector(".map-unit-group-count")).toHaveTextContent("(0)");
    });

    it("toggles grouping mode via the group's Add/Remove Units button", () => {
      const onStartGroupingMode = vi.fn();
      const units = [unit({groupIdentifier: "pack"})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} onStartGroupingMode={onStartGroupingMode} />);
      expandSection();

      fireEvent.click(screen.getByRole("button", {name: "Add/Remove Units"}));

      expect(onStartGroupingMode).toHaveBeenCalledWith("pack");
    });

    it("shows 'Done' instead of 'Add/Remove Units' when grouping mode targets this group", () => {
      const units = [unit({groupIdentifier: "pack"})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} groupingMode={{groupIdentifier: "pack"}} />);
      expandSection();

      expect(screen.getByRole("button", {name: "Done"})).toBeInTheDocument();
    });

    it("clicking a unit row while grouping mode is active toggles membership instead of expanding", () => {
      const onToggleGroupMember = vi.fn();
      const units = [unit({identifier: "a"})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} groupingMode={{groupIdentifier: "pack"}} onToggleGroupMember={onToggleGroupMember} />);
      expandSection();

      fireEvent.click(document.querySelector(".map-unit-row"));

      expect(onToggleGroupMember).toHaveBeenCalledWith(0);
      // Grouping mode suppresses the normal expand - no editing form shown.
      expect(document.querySelector(".map-unit-body")).not.toBeInTheDocument();
    });

    it("marks a group's own members with a checkmark while grouping mode targets it", () => {
      const units = [unit({identifier: "a", groupIdentifier: "pack"}), unit({identifier: "b"})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} groupingMode={{groupIdentifier: "pack"}} />);
      expandSection();

      const rows = document.querySelectorAll(".map-unit-row");
      expect(rows[0]).toHaveTextContent("✓");
    });

    it("renames a group on blur, dispatching UPDATE_ENTRY_FIELD's rewrite via onRenameGroup", () => {
      const onRenameGroup = vi.fn();
      const units = [unit({groupIdentifier: "old-name"})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} onRenameGroup={onRenameGroup} />);
      expandSection();

      const nameField = document.querySelector(".map-unit-group-name");
      fireEvent.change(nameField, {target: {value: "new-name"}});
      fireEvent.blur(nameField);

      expect(onRenameGroup).toHaveBeenCalledWith("old-name", "new-name");
    });

    it("hovering a group's header calls onHoverGroup, and reverts on leave", () => {
      const onHoverGroup = vi.fn();
      const units = [unit({groupIdentifier: "pack"})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} onHoverGroup={onHoverGroup} />);
      expandSection();

      const header = document.querySelector(".map-unit-group-header");
      fireEvent.mouseEnter(header.closest(".map-unit-group-block"));
      expect(onHoverGroup).toHaveBeenCalledWith("pack");
      fireEvent.mouseLeave(header.closest(".map-unit-group-block"));
      expect(onHoverGroup).toHaveBeenCalledWith(null);
    });

    it("collapses/expands a group's member rows on header click, independent of member expand state", () => {
      const units = [unit({identifier: "a", groupIdentifier: "pack"})];
      render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
      expandSection();

      expect(document.querySelector(".map-unit-group-members")).toBeInTheDocument();
      fireEvent.click(document.querySelector(".map-unit-group-header"));
      expect(document.querySelector(".map-unit-group-members")).not.toBeInTheDocument();
      fireEvent.click(document.querySelector(".map-unit-group-header"));
      expect(document.querySelector(".map-unit-group-members")).toBeInTheDocument();
    });

    it("shows a grouping-mode hint with the active group's name", () => {
      render(<UnitsPanel {...DEFAULT_PROPS} units={[]} groupingMode={{groupIdentifier: "pack"}} />);
      expandSection();

      expect(screen.getByText(/Grouping "pack"/)).toBeInTheDocument();
    });
  });
});
