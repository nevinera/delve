import {describe, it, expect, vi, afterEach} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent, waitFor, within} from "@testing-library/react";
import ItemLevel from "../levels/ItemLevel";
import ItemList from "../levels/ItemList";
import {fixtureDraft} from "../state/__tests__/fixtureWorld";
import {mapData} from "../state/mapOps";
import {itemData, itemKeys} from "../state/itemOps";
import {LibraryReader} from "../state/libraryReader";
import {fakeClient} from "../state/__tests__/fakeLibrary";

function renderWith(Level, props) {
  const result = {draft: null};
  function Harness() {
    const [current, setCurrent] = useState(fixtureDraft);
    result.draft = current;
    return <Level draft={current} onChange={setCurrent} repo="o/content" {...props} />;
  }
  render(<Harness />);
  return result;
}

afterEach(() => vi.restoreAllMocks());

describe("ItemLevel", () => {
  it("edits the item in the live draft, its identifier fixed to its key", () => {
    const result = renderWith(ItemLevel, {item: "iron-ring"});

    fireEvent.change(screen.getByDisplayValue("Iron Ring"), {target: {value: "Rusty Ring"}});

    expect(itemData(result.draft, "iron-ring")).toMatchObject({identifier: "iron-ring", name: "Rusty Ring"});
    expect(screen.queryByDisplayValue("iron-ring")).not.toBeInTheDocument();
  });

  it("uploads an icon into the world's graphics/items/", async () => {
    const result = renderWith(ItemLevel, {item: "iron-ring"});

    fireEvent.click(screen.getByRole("button", {name: "Icon"}));
    fireEvent.change(screen.getByLabelText("Upload Icon"), {target: {files: [new File(["png"], "ring.png", {type: "image/png"})]}});

    await waitFor(() => expect(itemData(result.draft, "iron-ring").icon_url).toEqual("../graphics/items/ring.png"));
    expect(result.draft.read("worlds/w/graphics/items/ring.png")).toBeInstanceOf(Blob);
  });
});

describe("ItemList", () => {
  const list = () => within(screen.getByRole("region", {name: "Items"}));

  it("creates an item and opens it", () => {
    const onOpen = vi.fn();
    const result = renderWith(ItemList, {onOpen});

    fireEvent.click(list().getByRole("button", {name: "+ New item"}));
    fireEvent.change(list().getByRole("textbox", {name: "Item identifier"}), {target: {value: "gold-ring"}});
    fireEvent.click(list().getByRole("button", {name: "Create"}));

    expect(itemKeys(result.draft)).toEqual(["gold-ring", "iron-ring"]);
    expect(onOpen).toHaveBeenCalledWith("gold-ring");
  });

  it("renames an item in every loot table", () => {
    const result = renderWith(ItemList, {onOpen: vi.fn()});

    fireEvent.click(list().getByRole("button", {name: "Rename iron-ring"}));
    fireEvent.change(list().getByRole("textbox", {name: "New identifier for iron-ring"}), {target: {value: "steel-ring"}});
    fireEvent.click(list().getByRole("button", {name: "Rename"}));

    expect(mapData(result.draft, "forest", "hub").units[1].lootTable).toEqual({"steel-ring": 1});
  });

  it("explains why a dropped item can't be deleted", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWith(ItemList, {onOpen: vi.fn()});

    fireEvent.click(list().getByRole("button", {name: "Delete iron-ring"}));

    expect(list().getByRole("alert")).toHaveTextContent("still dropped on forest/hub (1)");
  });

  it("imports an item from the library", async () => {
    const library = new LibraryReader(fakeClient({"items/gold-ring.json": {identifier: "gold-ring", name: "Gold Ring", slot: "ring"}}), "c1");
    const result = renderWith(ItemList, {onOpen: vi.fn(), library});

    fireEvent.click(list().getByRole("button", {name: "Import…"}));
    const select = list().getByRole("combobox", {name: "Library item"});
    await within(select).findByRole("option", {name: "gold-ring"});
    fireEvent.change(select, {target: {value: "items/gold-ring.json"}});
    fireEvent.click(list().getByRole("button", {name: "Import"}));

    await waitFor(() => expect(itemKeys(result.draft)).toEqual(["gold-ring", "iron-ring"]));
  });
});
