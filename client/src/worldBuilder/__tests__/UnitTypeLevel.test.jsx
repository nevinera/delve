import {describe, it, expect, vi, afterEach} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent, waitFor, within} from "@testing-library/react";
import UnitTypeLevel from "../levels/UnitTypeLevel";
import UnitTypeList from "../levels/UnitTypeList";
import {fixtureDraft} from "../state/__tests__/fixtureWorld";
import {mapData} from "../state/mapOps";
import {unitTypeData, unitTypeKeys} from "../state/unitTypeOps";
import {LibraryReader} from "../state/libraryReader";
import {fakeClient} from "../state/__tests__/fakeLibrary";

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

describe("importing from the library", () => {
  const LIBRARY = {
    "unit_types/demo/troll.json": {name: "Troll", tokenImageUrl: ["../../tokens/unit/troll.webp"], powers: [{name: "Smash", iconURL: "../../graphics/icons/smash.png"}]},
    "tokens/unit/troll.webp": "img",
    "graphics/icons/smash.png": "img",
  };
  const library = () => new LibraryReader(fakeClient(LIBRARY), "c1");

  it("imports a library unit type from the world's list", async () => {
    const result = renderWith(UnitTypeList, {onOpen: vi.fn(), library: library()});
    const list = within(screen.getByRole("region", {name: "Unit types"}));

    fireEvent.click(list.getByRole("button", {name: "Import…"}));
    const select = list.getByRole("combobox", {name: "Library unit type"});
    await within(select).findByRole("option", {name: "demo/troll"});
    fireEvent.change(select, {target: {value: "unit_types/demo/troll.json"}});
    expect(list.getByRole("textbox", {name: "Imported unit type identifier"})).toHaveValue("troll");
    fireEvent.click(list.getByRole("button", {name: "Import"}));

    await waitFor(() => expect(unitTypeKeys(result.draft)).toEqual(["goblin", "troll"]));
    expect(result.draft.exists("worlds/w/tokens/unit/troll.webp")).toBe(true);
  });

  it("copies a library power's assets into the world when it's imported", async () => {
    const result = renderWith(UnitTypeLevel, {unitType: "goblin", library: library()});

    fireEvent.click(screen.getByRole("button", {name: "+ Import power"}));
    fireEvent.change(screen.getByRole("combobox", {name: "Source type"}), {target: {value: "unitType"}});
    const source = await screen.findByRole("combobox", {name: "Source"});
    await within(source).findByRole("option", {name: "demo/troll"});
    fireEvent.change(source, {target: {value: "unit_types/demo/troll.json"}});
    await screen.findByText("Smash");
    fireEvent.click(screen.getByRole("button", {name: "Import"}));

    await waitFor(() => expect(unitTypeData(result.draft, "goblin").powers).toEqual([{name: "Smash", iconURL: "../graphics/icons/smash.png"}]));
    expect(result.draft.exists("worlds/w/graphics/icons/smash.png")).toBe(true);
  });
});
