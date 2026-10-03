import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent, within} from "@testing-library/react";
import UnitsTab from "../UnitsTab";

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
  unitTypes: {keys: AVAILABLE_UNIT_TYPE_KEYS, details: UNIT_TYPE_DETAILS}, onChooseUnitType: noop,
  items: {keys: AVAILABLE_ITEM_KEYS, details: ITEM_DETAILS}, onChooseItem: noop,
  canPlaceOnMap: true, openGroup: null, onOpenGroup: noop, onCloseGroup: noop, onRenameGroup: noop,
  armedUnitType: null, onArmUnitType: noop, onHoverUnitType: noop, onAddToPalette: noop,
  onHoverGroup: noop, unitPlacement: null, onStartUnitPlacement: noop, dispatch: noop,
};

function unit(identifier, fields = {}) {
  return {unitType: "goblin-raider", identifier, position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, ...fields};
}

// The per-unit editing tests below show their units as one open group
// ("g"), the way they're edited.
function GroupView({units, ...props}) {
  const grouped = units.map((u) => (u.groupIdentifier ? u : {...u, groupIdentifier: "g"}));
  return <UnitsTab {...props} units={grouped} openGroup="g" />;
}

// A unit's own row is collapsed by default (name/type/token/loot-icon only)
// - most tests need it open to reach the editing form/loot table.
function expandUnitRow(i = 0) {
  fireEvent.click(document.querySelectorAll(".map-unit-row")[i]);
}

describe("UnitsTab", () => {
  it("collapses each unit into a row with just its name, type, and token - no loot icon without loot", () => {
    const units = [unit("goblin_a"), unit("goblin_b")];
    render(<GroupView {...DEFAULT_PROPS} units={units} />);

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
    render(<GroupView {...DEFAULT_PROPS} units={units} />);

    expect(document.querySelector(".map-unit-row-name")).toHaveTextContent("Unit 1");
  });

  it("shows a 💰 loot icon on the row only when the unit has loot entries", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, lootTable: {"sword-of-doom": 1}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} />);

    expect(document.querySelector(".map-unit-row-loot-icon")).toHaveTextContent("💰");
  });

  it("expands a unit's row on click, revealing the editing form, and collapses it again on a second click", () => {
    const units = [unit("a"), unit("b")];
    render(<GroupView {...DEFAULT_PROPS} units={units} />);

    expect(document.querySelector(".map-unit-body")).not.toBeInTheDocument();
    expandUnitRow();
    expect(document.querySelector(".map-unit-body")).toBeInTheDocument();
    expandUnitRow();
    expect(document.querySelector(".map-unit-body")).not.toBeInTheDocument();
  });

  it("reports the expanded index set upward via onExpandedIndicesChange, for MapCanvas's movement overlay", () => {
    const onExpandedIndicesChange = vi.fn();
    const units = [unit("a"), unit("b")];
    render(<GroupView {...DEFAULT_PROPS} units={units} onExpandedIndicesChange={onExpandedIndicesChange} />);

    expect(onExpandedIndicesChange).toHaveBeenLastCalledWith(new Set());
    expandUnitRow();
    expect(onExpandedIndicesChange).toHaveBeenLastCalledWith(new Set([0]));
    expandUnitRow();
    expect(onExpandedIndicesChange).toHaveBeenLastCalledWith(new Set());
  });

  it("expands multiple units' rows independently - opening one doesn't close another", () => {
    const units = [
      {unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
      {unitType: "slime", identifier: "b", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
    ];
    render(<GroupView {...DEFAULT_PROPS} units={units} />);

    expandUnitRow(0);
    expandUnitRow(1);

    expect(document.querySelectorAll(".map-unit-body")).toHaveLength(2);
  });

  it("lists each unit with its type label, identifier field, and HP slider, once expanded", () => {
    const units = [{unitType: "goblin-raider", identifier: "goblin_a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 0.5, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} />);
    expandUnitRow();

    expect(screen.getByDisplayValue("goblin_a")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows a unit's real token image in its own panel beside the editing form, once expanded", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} />);
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
    render(<GroupView {...DEFAULT_PROPS} units={units} />);
    expandUnitRow();

    expect(document.querySelector(".map-unit-token-panel img")).not.toBeInTheDocument();
    expect(document.querySelector(".map-unit-token-panel .map-unit-token-thumb-fallback")).toBeInTheDocument();
  });

  it("shows a unit's position as a clickable coordinate pill that starts position placement", () => {
    const onStartUnitPlacement = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 12.34, y: 8, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} onStartUnitPlacement={onStartUnitPlacement} />);
    expandUnitRow();

    fireEvent.click(screen.getByRole("button", {name: "12.3, 8"}));

    expect(onStartUnitPlacement).toHaveBeenCalledWith(0);
  });

  it("edits a unit's facing angle, keeping x/y", () => {
    const dispatch = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 12.34, y: 8, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
    expandUnitRow();

    const facingSlider = screen.getAllByRole("slider").find((el) => el.max === "359");
    fireEvent.change(facingSlider, {target: {value: "180"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "position",
      value: {x: 12.34, y: 8, angle: 180},
    });
  });

  it("shows a pending '…' on the position pill while placing, and disables it", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} unitPlacement={{unitIndex: 0}} />);
    expandUnitRow();

    const pending = screen.getByRole("button", {name: "…"});
    expect(pending).toBeDisabled();
    expect(screen.queryByRole("button", {name: "0, 0"})).not.toBeInTheDocument();
  });

  it("falls back to the raw unitType key when it's not in availableUnitTypes", () => {
    const units = [{unitType: "unknown-type", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} />);

    expect(document.querySelector(".map-unit-row-type")).toHaveTextContent("unknown-type");
  });

  it("edits a unit's type via the dropdown", () => {
    const dispatch = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
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
    render(<GroupView {...DEFAULT_PROPS} units={units} />);
    expandUnitRow();

    expect(screen.getByRole("option", {name: "goblin (not a real unit type)"})).toBeInTheDocument();
    const selects = screen.getAllByRole("combobox");
    const typeSelect = selects.find((el) => el.closest(".map-unit-body"));
    expect(typeSelect).toHaveValue("goblin");
  });

  it("edits a unit's identifier", () => {
    const dispatch = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "old", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
    expandUnitRow();

    fireEvent.change(screen.getByDisplayValue("old"), {target: {value: "new_id"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "identifier", value: "new_id",
    });
  });

  it("edits a unit's HP via the slider", () => {
    const dispatch = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
    expandUnitRow();

    const hpSlider = screen.getAllByRole("slider").find((el) => el.max === "1");
    fireEvent.change(hpSlider, {target: {value: "0.25"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "currentHpFraction", value: 0.25,
    });
  });

  it("calls onHover on mouse enter/leave of an entry", () => {
    const onHover = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} onHover={onHover} />);

    const entry = document.querySelector(".entry-block");
    fireEvent.mouseEnter(entry);
    expect(onHover).toHaveBeenCalledWith(0);
    fireEvent.mouseLeave(entry);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it("highlights a row when hoveredIndex matches it (e.g. hovering its token on the map)", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} hoveredIndex={0} />);

    expect(document.querySelector(".entry-block")).toHaveClass("map-entry-hovered");
  });

  it("removes a unit, clearing selection if it was selected", () => {
    const dispatch = vi.fn();
    const onSelect = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<GroupView {...DEFAULT_PROPS} units={units} selectedIndex={0} onSelect={onSelect} dispatch={dispatch} />);
    expandUnitRow();

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));

    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_ENTRY", section: "units", index: 0});
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  describe("loot table", () => {
    function unitWithLoot(lootTable) {
      return {unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, lootTable};
    }

    it("shows a placeholder when a unit has no loot yet", () => {
      render(<GroupView {...DEFAULT_PROPS} units={[unitWithLoot(undefined)]} />);
      expandUnitRow();

      expect(screen.getByText("No loot yet.")).toBeInTheDocument();
    });

    it("lists each loot entry with its resolved item name and weight", () => {
      const units = [unitWithLoot({"sword-of-doom": 3})];
      render(<GroupView {...DEFAULT_PROPS} units={units} />);
      expandUnitRow();

      expect(screen.getByText("Sword of Doom")).toBeInTheDocument();
      expect(screen.getByDisplayValue("3")).toBeInTheDocument();
    });

    it("adds a new loot entry at weight 1, keyed by the item's own identifier", () => {
      const dispatch = vi.fn();
      const units = [unitWithLoot({})];
      render(<GroupView {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
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
      render(<GroupView {...DEFAULT_PROPS} units={units} />);
      expandUnitRow();

      const itemSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="iron-shield"]'));
      expect(itemSelect.querySelector('option[value="sword-of-doom"]')).not.toBeInTheDocument();
      expect(itemSelect.querySelector('option[value="iron-shield"]')).toBeInTheDocument();
    });

    it("edits a loot entry's weight", () => {
      const dispatch = vi.fn();
      const units = [unitWithLoot({"sword-of-doom": 1})];
      render(<GroupView {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
      expandUnitRow();

      fireEvent.change(document.querySelector(".map-loot-entry input"), {target: {value: "5"}});

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "lootTable", value: {"sword-of-doom": 5},
      });
    });

    it("removes a loot entry", () => {
      const dispatch = vi.fn();
      const units = [unitWithLoot({"sword-of-doom": 1, "iron-shield": 2})];
      render(<GroupView {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
      expandUnitRow();

      fireEvent.click(document.querySelector(".map-loot-entry-remove"));

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "lootTable", value: {"iron-shield": 2},
      });
    });

    it("requests item details when an item is chosen from the dropdown", () => {
      const onChooseItem = vi.fn();
      const units = [unitWithLoot({})];
      render(<GroupView {...DEFAULT_PROPS} units={units} onChooseItem={onChooseItem} />);
      expandUnitRow();

      const itemSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="sword-of-doom"]'));
      fireEvent.change(itemSelect, {target: {value: "sword-of-doom"}});

      expect(onChooseItem).toHaveBeenCalledWith("sword-of-doom");
    });

    it("defaults the loot count field to 1 when unset", () => {
      const units = [unitWithLoot({"sword-of-doom": 1})];
      render(<GroupView {...DEFAULT_PROPS} units={units} />);
      expandUnitRow();

      expect(document.querySelector(".map-loot-count-field input").value).toBe("1");
    });

    it("edits the loot count field", () => {
      const dispatch = vi.fn();
      const units = [unitWithLoot({"sword-of-doom": 1})];
      render(<GroupView {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
      expandUnitRow();

      fireEvent.change(document.querySelector(".map-loot-count-field input"), {target: {value: "0.25"}});

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "lootCount", value: 0.25,
      });
    });
  });

  describe("movement", () => {
    function unit(overrides) {
      return {unitType: "goblin-raider", identifier: "a", position: {x: 10, y: 20, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, ...overrides};
    }

    function movementSelect() {
      const selects = screen.getAllByRole("combobox");
      return selects.find((el) => el.querySelector('option[value="patrol"]'));
    }

    it("defaults to Still, and switching to Patrol replaces the whole movement object, seeding one step at the unit's own position", () => {
      const dispatch = vi.fn();
      const units = [unit()];
      render(<GroupView {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
      expandUnitRow();

      expect(movementSelect()).toHaveValue("still");
      fireEvent.change(movementSelect(), {target: {value: "patrol"}});

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "movement",
        value: {
          type: "patrol", choose: "loop",
          steps: [{position: {x: 10, y: 20, angle: 0}, movementRate: 0.5, waitTime: 1}],
        },
      });
    });

    it("switching to Wander seeds the location from the unit's own position", () => {
      const dispatch = vi.fn();
      const units = [unit()];
      render(<GroupView {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
      expandUnitRow();

      fireEvent.change(movementSelect(), {target: {value: "wander"}});

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "movement",
        value: {type: "wander", location: {x: 10, y: 20}, radius: 10, speed: 0.3, waitTime: 1},
      });
    });

    it("shows a placeholder and a single '+' when a patrol unit has no steps yet, arming insert placement at index 0", () => {
      const onStartPatrolStepPlacement = vi.fn();
      const units = [unit({movement: {type: "patrol", choose: "loop", steps: []}})];
      render(<GroupView {...DEFAULT_PROPS} units={units} onStartPatrolStepPlacement={onStartPatrolStepPlacement} />);
      expandUnitRow();

      expect(screen.getByText("No steps yet.")).toBeInTheDocument();
      const plusButtons = document.querySelectorAll(".map-unit-movement-fields .map-point-plus");
      expect(plusButtons).toHaveLength(1);
      fireEvent.click(plusButtons[0]);

      expect(onStartPatrolStepPlacement).toHaveBeenCalledWith(0, 0, "insert");
    });

    it("shows no '+' before step 0 (the unit's own position) - only between/after existing steps", () => {
      const onStartPatrolStepPlacement = vi.fn();
      const units = [unit({movement: {
        type: "patrol", choose: "loop",
        steps: [
          {position: {x: 1, y: 2, angle: 0}, movementRate: 0.4, waitTime: 2},
          {position: {x: 3, y: 4, angle: 0}, movementRate: 0.4, waitTime: 2},
        ],
      }})];
      render(<GroupView {...DEFAULT_PROPS} units={units} onStartPatrolStepPlacement={onStartPatrolStepPlacement} />);
      expandUnitRow();

      const plusButtons = document.querySelectorAll(".map-unit-movement-fields .map-point-plus");
      expect(plusButtons).toHaveLength(2); // between 0/1, after step 1 - none before step 0

      fireEvent.click(plusButtons[0]); // between the two existing steps
      expect(onStartPatrolStepPlacement).toHaveBeenCalledWith(0, 1, "insert");
    });

    it("shows a single '+' (and no remove button) for step 0 when it's the only step, since it's the unit's own position", () => {
      const units = [unit({movement: {
        type: "patrol", choose: "loop",
        steps: [{position: {x: 1, y: 2, angle: 0}, movementRate: 0.4, waitTime: 2}],
      }})];
      render(<GroupView {...DEFAULT_PROPS} units={units} />);
      expandUnitRow();

      expect(document.querySelectorAll(".map-unit-movement-fields .map-point-plus")).toHaveLength(1);
      expect(document.querySelector(".map-patrol-step .map-loot-entry-remove")).not.toBeInTheDocument();
    });

    it("shows a pending '…' placeholder at the gap currently being placed into", () => {
      const units = [unit({movement: {
        type: "patrol", choose: "loop",
        steps: [{position: {x: 1, y: 2, angle: 0}, movementRate: 0.4, waitTime: 2}],
      }})];
      render(<GroupView {...DEFAULT_PROPS} units={units} patrolStepPlacement={{unitIndex: 0, stepIndex: 1, mode: "insert"}} />);
      expandUnitRow();

      expect(document.querySelector(".map-patrol-step-pending")).toHaveTextContent("…");
    });

    it("lists a patrol unit's steps with an editable position pill, rate, and wait time", () => {
      const onUpdateMovement = vi.fn();
      const units = [unit({movement: {
        type: "patrol", choose: "loop",
        steps: [{position: {x: 1, y: 2, angle: 0}, movementRate: 0.4, waitTime: 2}],
      }})];
      render(<GroupView {...DEFAULT_PROPS} units={units} onUpdateMovement={onUpdateMovement} />);
      expandUnitRow();

      expect(screen.getByRole("button", {name: "1, 2"})).toBeInTheDocument();

      fireEvent.change(document.querySelector(".map-patrol-step input"), {target: {value: "0.8"}});
      expect(onUpdateMovement).toHaveBeenCalledWith(0, {
        steps: [{position: {x: 1, y: 2, angle: 0}, movementRate: 0.8, waitTime: 2}],
      });
    });

    it("clicking a patrol step's position pill starts edit placement for that step", () => {
      const onStartPatrolStepEdit = vi.fn();
      const units = [unit({movement: {
        type: "patrol", choose: "loop",
        steps: [{position: {x: 1, y: 2, angle: 0}, movementRate: 0.4, waitTime: 2}],
      }})];
      render(<GroupView {...DEFAULT_PROPS} units={units} onStartPatrolStepEdit={onStartPatrolStepEdit} />);
      expandUnitRow();

      fireEvent.click(screen.getByRole("button", {name: "1, 2"}));

      expect(onStartPatrolStepEdit).toHaveBeenCalledWith(0, 0);
    });

    it("calls onHoverPatrolStep on mouse enter/leave of a patrol step's position pill", () => {
      const onHoverPatrolStep = vi.fn();
      const units = [unit({movement: {
        type: "patrol", choose: "loop",
        steps: [{position: {x: 1, y: 2, angle: 0}, movementRate: 0.4, waitTime: 2}],
      }})];
      render(<GroupView {...DEFAULT_PROPS} units={units} onHoverPatrolStep={onHoverPatrolStep} />);
      expandUnitRow();

      const pill = screen.getByRole("button", {name: "1, 2"});
      fireEvent.mouseEnter(pill);
      expect(onHoverPatrolStep).toHaveBeenCalledWith({unitIndex: 0, stepIndex: 0});
      fireEvent.mouseLeave(pill);
      expect(onHoverPatrolStep).toHaveBeenCalledWith(null);
    });

    it("removes a patrol step after the first one (step 0 has no remove button)", () => {
      const onUpdateMovement = vi.fn();
      const units = [unit({movement: {
        type: "patrol", choose: "loop",
        steps: [
          {position: {x: 1, y: 2, angle: 0}, movementRate: 0.4, waitTime: 2},
          {position: {x: 3, y: 4, angle: 0}, movementRate: 0.4, waitTime: 2},
          {position: {x: 5, y: 6, angle: 0}, movementRate: 0.4, waitTime: 2},
        ],
      }})];
      render(<GroupView {...DEFAULT_PROPS} units={units} onUpdateMovement={onUpdateMovement} />);
      expandUnitRow();

      const removeButtons = document.querySelectorAll(".map-patrol-step .map-loot-entry-remove");
      expect(removeButtons).toHaveLength(2); // steps 1 and 2, not step 0
      fireEvent.click(removeButtons[0]);

      expect(onUpdateMovement).toHaveBeenCalledWith(0, {
        steps: [
          {position: {x: 1, y: 2, angle: 0}, movementRate: 0.4, waitTime: 2},
          {position: {x: 5, y: 6, angle: 0}, movementRate: 0.4, waitTime: 2},
        ],
      });
    });

    it("edits a patrol unit's choose mode", () => {
      const onUpdateMovement = vi.fn();
      const units = [unit({movement: {type: "patrol", choose: "loop", steps: []}})];
      render(<GroupView {...DEFAULT_PROPS} units={units} onUpdateMovement={onUpdateMovement} />);
      expandUnitRow();

      fireEvent.change(screen.getByDisplayValue("loop"), {target: {value: "random"}});

      expect(onUpdateMovement).toHaveBeenCalledWith(0, {choose: "random"});
    });

    it("shows a wander unit's location pill, and starts placement on click", () => {
      const onStartWanderLocationPlacement = vi.fn();
      const units = [unit({movement: {type: "wander", location: {x: 5, y: 6}, radius: 10, speed: 0.3, waitTime: 1}})];
      render(<GroupView {...DEFAULT_PROPS} units={units} onStartWanderLocationPlacement={onStartWanderLocationPlacement} />);
      expandUnitRow();

      const pill = screen.getByRole("button", {name: "5, 6"});
      fireEvent.click(pill);

      expect(onStartWanderLocationPlacement).toHaveBeenCalledWith(0);
    });

    it("edits a wander unit's radius/speed/waitTime", () => {
      const onUpdateMovement = vi.fn();
      const units = [unit({movement: {type: "wander", location: {x: 5, y: 6}, radius: 10, speed: 0.3, waitTime: 1}})];
      render(<GroupView {...DEFAULT_PROPS} units={units} onUpdateMovement={onUpdateMovement} />);
      expandUnitRow();

      fireEvent.change(screen.getByDisplayValue("10"), {target: {value: "15"}});
      expect(onUpdateMovement).toHaveBeenCalledWith(0, {radius: 15});
    });

    it("disables the pending pill and shows '…' while a patrol step is being placed", () => {
      const units = [unit({movement: {
        type: "patrol", choose: "loop",
        steps: [{position: {x: 1, y: 2, angle: 0}, movementRate: 0.4, waitTime: 2}],
      }})];
      render(<GroupView {...DEFAULT_PROPS} units={units} patrolStepPlacement={{unitIndex: 0, stepIndex: 0, mode: "edit"}} />);
      expandUnitRow();

      const pending = screen.getByRole("button", {name: "…"});
      expect(pending).toBeDisabled();
      expect(screen.queryByRole("button", {name: "1, 2"})).not.toBeInTheDocument();
    });
  });
  describe("with no group open", () => {
    it("offers a palette of the unit types on the map, pressing one arms it and pressing it again disarms", () => {
      const onArmUnitType = vi.fn();
      const units = [unit("a"), unit("b", {unitType: "slime"}), unit("c")];
      const {rerender} = render(<UnitsTab {...DEFAULT_PROPS} units={units} onArmUnitType={onArmUnitType} />);
      const palette = within(screen.getByRole("region", {name: "Unit palette"}));

      expect(palette.getAllByRole("button", {pressed: false}).map((b) => b.textContent)).toEqual(["Goblin Raider", "Slime"]);
      fireEvent.click(palette.getByRole("button", {name: "Slime"}));
      expect(onArmUnitType).toHaveBeenLastCalledWith("slime");

      rerender(<UnitsTab {...DEFAULT_PROPS} units={units} onArmUnitType={onArmUnitType} armedUnitType="slime" />);
      fireEvent.click(palette.getByRole("button", {name: "Slime", pressed: true}));
      expect(onArmUnitType).toHaveBeenLastCalledWith(null);
    });

    it("reports hovering a palette entry, for highlighting its units", () => {
      const onHoverUnitType = vi.fn();
      render(<UnitsTab {...DEFAULT_PROPS} units={[unit("a")]} onHoverUnitType={onHoverUnitType} />);

      fireEvent.mouseEnter(screen.getByRole("button", {name: "Goblin Raider"}));
      fireEvent.mouseLeave(screen.getByRole("button", {name: "Goblin Raider"}));

      expect(onHoverUnitType.mock.calls).toEqual([["goblin-raider"], [null]]);
    });

    it("adds another of the world's unit types to the palette with +, arming it", () => {
      const onAddToPalette = vi.fn();
      const onArmUnitType = vi.fn();
      render(<UnitsTab {...DEFAULT_PROPS} units={[unit("a")]} onAddToPalette={onAddToPalette} onArmUnitType={onArmUnitType} />);

      fireEvent.click(screen.getByRole("button", {name: "Add a unit type"}));
      const popover = within(screen.getByRole("dialog", {name: "Add a unit type"}));
      expect(popover.getAllByRole("button").map((b) => b.textContent)).toEqual(["Slime"]);
      fireEvent.click(popover.getByRole("button", {name: "Slime"}));

      expect(onAddToPalette).toHaveBeenCalledWith("slime");
      expect(onArmUnitType).toHaveBeenCalledWith("slime");
    });

    it("shows unit types added with + in the palette even before any are placed", () => {
      render(<UnitsTab {...DEFAULT_PROPS} units={[]} paletteAdditions={["slime"]} />);
      expect(screen.getByRole("button", {name: "Slime"})).toBeInTheDocument();
    });

    it("can't arm anything until the map has feet dimensions", () => {
      render(<UnitsTab {...DEFAULT_PROPS} units={[unit("a")]} canPlaceOnMap={false} />);
      expect(screen.getByRole("button", {name: "Goblin Raider"})).toBeDisabled();
      expect(screen.getByText(/Set feet dimensions/)).toBeInTheDocument();
    });

    it("lists the groups, an ungrouped unit as a group of one, and opens one on click", () => {
      const onOpenGroup = vi.fn();
      const units = [unit("a", {groupIdentifier: "pack"}), unit("loner"), unit("b", {groupIdentifier: "pack"})];
      render(<UnitsTab {...DEFAULT_PROPS} units={units} onOpenGroup={onOpenGroup} />);
      const rows = within(screen.getByRole("list", {name: "Groups"})).getAllByRole("button");

      expect(rows.map((row) => [row.querySelector(".map-unit-group-row-name").textContent, row.querySelector(".map-unit-group-count").textContent]))
        .toEqual([["pack", "2"], ["loner", "1"]]);
      fireEvent.click(rows[1]);
      expect(onOpenGroup).toHaveBeenCalledWith({identifier: null, memberIndices: [1]});
    });

    it("reports hovering a group (or, for an ungrouped unit, the unit)", () => {
      const onHoverGroup = vi.fn();
      const onHover = vi.fn();
      render(<UnitsTab {...DEFAULT_PROPS} units={[unit("a", {groupIdentifier: "pack"}), unit("loner")]} onHoverGroup={onHoverGroup} onHover={onHover} />);
      const [pack, loner] = within(screen.getByRole("list", {name: "Groups"})).getAllByRole("button");

      fireEvent.mouseEnter(pack);
      fireEvent.mouseEnter(loner);

      expect(onHoverGroup).toHaveBeenCalledWith("pack");
      expect(onHover).toHaveBeenCalledWith(1);
    });
  });

  describe("with a group open", () => {
    const units = [unit("a", {groupIdentifier: "pack"}), unit("b"), unit("c", {groupIdentifier: "pack"})];

    it("shows only its members, collapsed, with no palette", () => {
      render(<UnitsTab {...DEFAULT_PROPS} units={units} openGroup="pack" />);

      expect([...document.querySelectorAll(".map-unit-row-name")].map((el) => el.textContent)).toEqual(["a", "c"]);
      expect(document.querySelector(".map-unit-body")).not.toBeInTheDocument();
      expect(screen.queryByRole("region", {name: "Unit palette"})).not.toBeInTheDocument();
    });

    it("opens a lone member's row straight away", () => {
      render(<UnitsTab {...DEFAULT_PROPS} units={[unit("a", {groupIdentifier: "solo"})]} openGroup="solo" />);
      expect(document.querySelector(".map-unit-body")).toBeInTheDocument();
    });

    it("closes from its link", () => {
      const onCloseGroup = vi.fn();
      render(<UnitsTab {...DEFAULT_PROPS} units={units} openGroup="pack" onCloseGroup={onCloseGroup} />);

      fireEvent.click(screen.getByRole("button", {name: "← Close group"}));

      expect(onCloseGroup).toHaveBeenCalled();
    });

    it("renames it on blur", () => {
      const onRenameGroup = vi.fn();
      render(<UnitsTab {...DEFAULT_PROPS} units={units} openGroup="pack" onRenameGroup={onRenameGroup} />);
      const name = screen.getByRole("textbox", {name: "Group name"});

      fireEvent.change(name, {target: {value: "wolves"}});
      fireEvent.blur(name);

      expect(onRenameGroup).toHaveBeenCalledWith("pack", "wolves");
    });

    it("opens a member's row when it's clicked on the map", () => {
      const {rerender} = render(<UnitsTab {...DEFAULT_PROPS} units={units} openGroup="pack" />);
      rerender(<UnitsTab {...DEFAULT_PROPS} units={units} openGroup="pack" focusUnitRequest={{index: 2, nonce: 1}} />);

      expect(document.querySelectorAll(".map-unit-block")[1]).toHaveClass("map-unit-expanded");
      expect(document.querySelectorAll(".map-unit-block")[0]).not.toHaveClass("map-unit-expanded");
    });
  });
});
