import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CharacterSheet, formatItemName } from "../App";

describe("formatItemName", () => {
  it("title-cases and replaces hyphens/underscores with spaces", () => {
    expect(formatItemName("helm-of-doom")).toBe("Helm Of Doom");
    expect(formatItemName("iron_sword")).toBe("Iron Sword");
  });

  it("returns an em dash for a missing identifier", () => {
    expect(formatItemName(undefined)).toBe("—");
    expect(formatItemName("")).toBe("—");
  });
});

describe("CharacterSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CharacterSheet open={false} equippedItems={{}} onClose={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows every equipped slot, filled or empty", () => {
    const equippedItems = {
      head: { identifier: "helm-of-doom", ilvl: 584, stats: { strength: 10 } },
    };
    render(<CharacterSheet open equippedItems={equippedItems} onClose={() => {}} />);

    expect(screen.getByText("Helm Of Doom")).toBeInTheDocument();
    expect(screen.getAllByText("Empty").length).toBeGreaterThan(0);
    expect(screen.getByText("Left Ring")).toBeInTheDocument();
  });

  it("sums stats across equipped items", () => {
    const equippedItems = {
      head: { identifier: "helm", stats: { strength: 10, crit_rating: 5 } },
      chest: { identifier: "chest", stats: { strength: 4, stamina: 20 } },
    };
    render(<CharacterSheet open equippedItems={equippedItems} onClose={() => {}} />);

    expect(screen.getByText("Strength").nextSibling.textContent).toBe("14");
    expect(screen.getByText("Stamina").nextSibling.textContent).toBe("20");
    expect(screen.getByText("Crit Rating").nextSibling.textContent).toBe("5");
  });

  it("shows every stat, including zero, when nothing is equipped", () => {
    render(<CharacterSheet open equippedItems={{}} onClose={() => {}} />);

    expect(screen.getByText("Strength").nextSibling.textContent).toBe("0");
    expect(screen.getByText("Weapon DPS").nextSibling.textContent).toBe("0");
    expect(screen.getByText("Resilience Rating").nextSibling.textContent).toBe("0");
  });

  it("groups stats under Primary and Secondary headings in order", () => {
    render(<CharacterSheet open equippedItems={{}} onClose={() => {}} />);

    const titles = screen.getAllByText(/Primary|Secondary/).map(el => el.textContent);
    expect(titles).toEqual(["Primary", "Secondary"]);
  });

  it("calls onClose when the close button is clicked", () => {
    let closed = false;
    render(<CharacterSheet open equippedItems={{}} onClose={() => { closed = true; }} />);
    fireEvent.click(screen.getByText("✕"));
    expect(closed).toBe(true);
  });

  it("does not open a candidate pane when clicking an empty slot", () => {
    render(<CharacterSheet open equippedItems={{}} onClose={() => {}} />);
    fireEvent.click(screen.getAllByText("Empty")[0]);
    expect(screen.queryByText("No items available.")).not.toBeInTheDocument();
  });

  describe("candidate pane", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function stubFetch(items) {
      const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve(items) });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("fetches and shows candidate items for the clicked slot, excluding already-equipped ones", async () => {
      const fetchMock = stubFetch([
        { id: 1, identifier: "iron-helm", name: "Iron Helm", source_key: "sk-1", stats: {} },
        { id: 2, identifier: "worn-helm", name: "Worn Helm", source_key: "sk-2", stats: {} },
      ]);
      const equippedItems = {
        head: { identifier: "iron-helm", source_key: "sk-1", stats: {} },
      };

      render(
        <CharacterSheet
          open
          equippedItems={equippedItems}
          characterItemsUrl="/play/characters/1/character_items.json"
          onClose={() => {}}
        />
      );

      fireEvent.click(screen.getByText("Iron Helm"));

      expect(fetchMock).toHaveBeenCalledWith("/play/characters/1/character_items.json?slot%5B%5D=head");
      await waitFor(() => expect(screen.getByText("Worn Helm")).toBeInTheDocument());
      // "Iron Helm" still appears once, in the equipped-items column - it must
      // not also show up in the candidate list since it's already equipped.
      expect(screen.getAllByText("Iron Helm")).toHaveLength(1);
    });

    it("requests every compatible item slot for a multi-slot equipped slot", async () => {
      const fetchMock = stubFetch([]);
      const equippedItems = {
        main_hand: { identifier: "sword", source_key: "sk-1", stats: {} },
      };

      render(
        <CharacterSheet
          open
          equippedItems={equippedItems}
          characterItemsUrl="/play/characters/1/character_items.json"
          onClose={() => {}}
        />
      );

      fireEvent.click(screen.getByText("Sword"));

      expect(fetchMock).toHaveBeenCalledWith(
        "/play/characters/1/character_items.json?slot%5B%5D=main_hand&slot%5B%5D=one_hand&slot%5B%5D=two_hand"
      );
      await waitFor(() => expect(screen.getByText("No items available.")).toBeInTheDocument());
    });

    it("closes the candidate pane when clicking the same slot again", async () => {
      stubFetch([]);
      const equippedItems = {
        head: { identifier: "iron-helm", source_key: "sk-1", stats: {} },
      };

      render(
        <CharacterSheet
          open
          equippedItems={equippedItems}
          characterItemsUrl="/play/characters/1/character_items.json"
          onClose={() => {}}
        />
      );

      fireEvent.click(screen.getByText("Iron Helm"));
      await waitFor(() => expect(screen.getByText("No items available.")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Iron Helm"));
      expect(screen.queryByText("No items available.")).not.toBeInTheDocument();
    });
  });
});
