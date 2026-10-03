import {describe, it, expect, vi, afterEach} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent, waitFor, within} from "@testing-library/react";
import UnitTypeLevel from "../levels/UnitTypeLevel";
import UnitTypeList from "../levels/UnitTypeList";
import {fixtureDraft} from "../state/__tests__/fixtureWorld";
import {mapData} from "../state/mapOps";
import {unitTypeData, unitTypeKeys} from "../state/unitTypeOps";

// The preview mounts a WebGL renderer jsdom can't back.
vi.mock("../../unitTypeEditor/UnitTypePreviewPane", () => ({default: () => <div data-testid="preview" />}));

const STOCK = {icons: {}, graphics: {}, sounds: {}};

function renderWith(Level, props, draft = fixtureDraft()) {
  const result = {draft: null, navigate: vi.fn()};
  function Harness() {
    const [current, setCurrent] = useState(draft);
    result.draft = current;
    return <Level draft={current} onChange={setCurrent} repo="o/content" stockAssets={STOCK} {...props} />;
  }
  render(<Harness />);
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe("UnitTypeLevel", () => {
  it("edits the unit type in the live draft", () => {
    const result = renderWith(UnitTypeLevel, {unitType: "goblin"});

    fireEvent.change(screen.getByDisplayValue("Goblin"), {target: {value: "Goblin Raider"}});

    expect(unitTypeData(result.draft, "goblin").name).toEqual("Goblin Raider");
    expect(result.draft.dirtyPaths()).toEqual(["worlds/w/unit_types/goblin.json"]);
  });

  it("picks a token from the world's tokens, and stores an upload under tokens/unit/", async () => {
    const result = renderWith(UnitTypeLevel, {unitType: "goblin"});

    fireEvent.click(screen.getByRole("button", {name: "+ Add token image"}));
    fireEvent.click(screen.getByRole("button", {name: "Token image 2"}));
    const file = new File(["png"], "raider.png", {type: "image/png"});
    fireEvent.change(screen.getByLabelText("Upload Token image 2"), {target: {files: [file]}});

    await waitFor(() => expect(unitTypeData(result.draft, "goblin").tokenImageUrl).toEqual(["../tokens/goblin.webp", "../tokens/unit/raider.png"]));
    expect(result.draft.read("worlds/w/tokens/unit/raider.png")).toBeInstanceOf(Blob);
  });

  it("copies a power from another of the world's unit types", async () => {
    const withTroll = fixtureDraft().write("worlds/w/unit_types/troll.json", {name: "Troll", tokenImageUrl: [], powers: [{name: "Smash", effects: []}]});
    const result = renderWith(UnitTypeLevel, {unitType: "goblin"}, withTroll);

    fireEvent.click(screen.getByRole("button", {name: "+ Import power"}));
    fireEvent.change(screen.getByRole("combobox", {name: "Source type"}), {target: {value: "world"}});
    fireEvent.change(await screen.findByRole("combobox", {name: "Source"}), {target: {value: "troll"}});
    await screen.findByText("Smash");
    fireEvent.click(screen.getByRole("button", {name: "Import"}));

    await waitFor(() => expect(unitTypeData(result.draft, "goblin").powers).toEqual([{name: "Smash", effects: []}]));
  });
});

describe("UnitTypeList", () => {
  const list = () => within(screen.getByRole("region", {name: "Unit types"}));

  it("creates a unit type and opens it", () => {
    const onOpen = vi.fn();
    const result = renderWith(UnitTypeList, {onOpen});

    fireEvent.click(list().getByRole("button", {name: "+ New unit type"}));
    fireEvent.change(list().getByRole("textbox", {name: "Unit type identifier"}), {target: {value: "troll"}});
    fireEvent.click(list().getByRole("button", {name: "Create"}));

    expect(unitTypeKeys(result.draft)).toEqual(["goblin", "troll"]);
    expect(onOpen).toHaveBeenCalledWith("troll");
  });

  it("renames a unit type everywhere it's used", () => {
    const result = renderWith(UnitTypeList, {onOpen: vi.fn()});

    fireEvent.click(list().getByRole("button", {name: "Rename goblin"}));
    fireEvent.change(list().getByRole("textbox", {name: "New identifier for goblin"}), {target: {value: "grunt"}});
    fireEvent.click(list().getByRole("button", {name: "Rename"}));

    expect(mapData(result.draft, "forest", "hub").units[0].unitType).toEqual("grunt");
  });

  it("explains why a placed unit type can't be deleted", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWith(UnitTypeList, {onOpen: vi.fn()});

    fireEvent.click(list().getByRole("button", {name: "Delete goblin"}));

    expect(list().getByRole("alert")).toHaveTextContent("still placed on forest/hub (1)");
  });
});
