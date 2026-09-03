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

// Reads a stat row's displayed value by label - robust to whether the label
// is wrapped in a StatEffectTooltip anchor (secondary stats) or bare
// (everything else), since either way it's the <li>'s last child.
function statValue(label) {
  return screen.getByText(label).closest("li").lastChild.textContent;
}

describe("CharacterSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CharacterSheet open={false} equippedItems={{}} onClose={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows every equipped slot, filled or empty", () => {
    const equippedItems = {
      head: { identifier: "helm-of-doom", elvl: 584, stats: { strength: 10 } },
    };
    render(<CharacterSheet open equippedItems={equippedItems} onClose={() => {}} />);

    expect(screen.getByText("Helm Of Doom")).toBeInTheDocument();
    expect(screen.getByText("584")).toBeInTheDocument();
    expect(screen.getAllByText("Empty").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ring")).toHaveLength(2);
  });

  it("prefers the item's real name over one derived from its identifier", () => {
    const equippedItems = {
      head: { identifier: "warchief-predators-head", name: "Warchief's Predator's Crown", elvl: 584 },
    };
    render(<CharacterSheet open equippedItems={equippedItems} onClose={() => {}} />);

    expect(screen.getByText("Warchief's Predator's Crown")).toBeInTheDocument();
    expect(screen.queryByText("Warchief Predators Head")).not.toBeInTheDocument();
  });

  it("colors an equipped item's elvl by delta from localElvl", () => {
    const equippedItems = {
      head: { identifier: "helm-of-doom", elvl: 30 },
    };
    render(<CharacterSheet open equippedItems={equippedItems} onClose={() => {}} localElvl={50} />);
    // delta -20 -> gray
    expect(screen.getByText("30")).toHaveStyle({ color: "#9d9d9d" });
  });

  it("sums stats across equipped items", () => {
    const equippedItems = {
      head: { identifier: "helm", stats: { strength: 10, crit_rating: 5 } },
      chest: { identifier: "chest", stats: { strength: 4, stamina: 20 } },
    };
    render(<CharacterSheet open equippedItems={equippedItems} onClose={() => {}} />);

    expect(statValue("Strength")).toBe("14.0");
    expect(statValue("Stamina")).toBe("20.0");
    expect(statValue("Crit Rating")).toBe("5.0");
  });

  it("spreads versatility rating's 0.2x bonus into strength/agility/intellect/defence rating", () => {
    const equippedItems = {
      head: { identifier: "helm", stats: { strength: 10, agility: 3, intellect: 2, defence_rating: 1, versatility_rating: 50 } },
    };
    render(<CharacterSheet open equippedItems={equippedItems} onClose={() => {}} />);

    // versatility_rating 50 * 0.2 = +10 to each
    expect(statValue("Strength")).toBe("20.0");
    expect(statValue("Agility")).toBe("13.0");
    expect(statValue("Intellect")).toBe("12.0");
    expect(statValue("Defence Rating")).toBe("11.0");
    expect(statValue("Versatility Rating")).toBe("50.0");
  });

  it("shows every stat, including zero, when nothing is equipped", () => {
    render(<CharacterSheet open equippedItems={{}} onClose={() => {}} />);

    expect(statValue("Strength")).toBe("0.0");
    expect(statValue("Defence Rating")).toBe("0.0");
  });

  it("groups stats under Primary and Secondary headings in order", () => {
    render(<CharacterSheet open equippedItems={{}} onClose={() => {}} />);

    const titles = screen.getAllByText(/Primary|Secondary/).map(el => el.textContent);
    expect(titles).toEqual(["Primary", "Secondary"]);
  });

  it("shows the local elevation when provided", () => {
    render(<CharacterSheet open equippedItems={{}} onClose={() => {}} localElvl={8} />);
    expect(statValue("Local Elevation")).toBe("8");
  });

  it("shows an em dash for local elevation when unknown", () => {
    render(<CharacterSheet open equippedItems={{}} onClose={() => {}} />);
    expect(statValue("Local Elevation")).toBe("—");
  });

  it("treats empty slots as elvl 0 for gear elevation, not skipped", () => {
    render(<CharacterSheet open equippedItems={{}} onClose={() => {}} />);
    expect(statValue("Gear Elevation")).toBe("0.0");
  });

  it("weights gear elevation by each item's slot factor, empty slots included at 0", () => {
    const equippedItems = {
      // main_hand holds a two_hand item (factor 4) at elvl 10, ring_1 holds
      // a ring (factor 1) at elvl 2; every other slot is empty (elvl 0, its
      // own equip-slot's default factor). Total weight across all 14 equip
      // slots is 19.5 (17.5 baseline, +2 for main_hand's two_hand override);
      // weighted sum is 10*4 + 2*1 = 42; 42/19.5 ≈ 2.2.
      main_hand: { identifier: "axe", slot: "two_hand", elvl: 10 },
      ring_1: { identifier: "band", slot: "ring", elvl: 2 },
    };
    render(<CharacterSheet open equippedItems={equippedItems} onClose={() => {}} />);
    expect(statValue("Gear Elevation")).toBe("2.2");
  });

  describe("secondary stat effect tooltips", () => {
    function effectLines(label, equippedItems) {
      render(<CharacterSheet open equippedItems={equippedItems} onClose={() => {}} />);
      const labelEl = screen.getByText(label);
      fireEvent.mouseEnter(labelEl, {clientX: 10, clientY: 10});
      return labelEl;
    }

    it("shows crit rating's actual crit chance, including the 5% base", () => {
      effectLines("Crit Rating", {head: {identifier: "h", stats: {crit_rating: 30}}});
      expect(screen.getByText("7.0% crit chance")).toBeInTheDocument();
    });

    it("shows haste rating's haste percentage", () => {
      effectLines("Haste Rating", {head: {identifier: "h", stats: {haste_rating: 117.1}}});
      expect(screen.getByText("+10.0% haste")).toBeInTheDocument();
    });

    it("shows mastery rating's converted mastery value", () => {
      effectLines("Mastery Rating", {head: {identifier: "h", stats: {mastery_rating: 0}}});
      expect(screen.getByText("Mastery 10.0")).toBeInTheDocument();
    });

    it("shows versatility rating's spread bonus", () => {
      effectLines("Versatility Rating", {head: {identifier: "h", stats: {versatility_rating: 50}}});
      expect(screen.getByText("+10.0 Strength, Agility, Intellect, and Defence Rating")).toBeInTheDocument();
    });

    it("shows defence rating's physical and magic damage reduction", () => {
      effectLines("Defence Rating", {head: {identifier: "h", stats: {defence_rating: 98}}});
      expect(screen.getByText("45.0% physical damage reduction")).toBeInTheDocument();
      expect(screen.getByText("18.0% magic damage reduction")).toBeInTheDocument();
    });

    it("hides the tooltip again on mouse leave", () => {
      const labelEl = effectLines("Crit Rating", {head: {identifier: "h", stats: {crit_rating: 30}}});
      fireEvent.mouseLeave(labelEl);
      expect(screen.queryByText("7.0% crit chance")).not.toBeInTheDocument();
    });

  });

  describe("primary stat effect tooltips", () => {
    function hover(label, equippedItems, primaryStats) {
      render(<CharacterSheet open equippedItems={equippedItems} onClose={() => {}} primaryStats={primaryStats} />);
      const labelEl = screen.getByText(label);
      fireEvent.mouseEnter(labelEl, {clientX: 10, clientY: 10});
      return labelEl;
    }

    it("shows strength's parry chance, but not DPS, when strength isn't the class's damage stat", () => {
      hover("Strength", {head: {identifier: "h", stats: {strength: 250}}}, []);
      expect(screen.getByText("30.0% Parry chance")).toBeInTheDocument();
      expect(screen.queryByText(/^\+[\d.]+ DPS$/)).not.toBeInTheDocument();
    });

    it("also shows strength's DPS contribution when strength is a class primary stat", () => {
      hover("Strength", {head: {identifier: "h", stats: {strength: 70}}}, ["strength"]);
      expect(screen.getByText("+10.0 DPS")).toBeInTheDocument();
      expect(screen.getByText("13.1% Parry chance")).toBeInTheDocument();
    });

    it("shows agility's effective crit rating and dodge chance always, DPS only when it's a class primary", () => {
      hover("Agility", {head: {identifier: "h", stats: {agility: 250}}}, []);
      expect(screen.getByText("+150.0 effective Crit Rating")).toBeInTheDocument();
      expect(screen.getByText("30.0% Dodge chance")).toBeInTheDocument();
      expect(screen.queryByText(/^\+[\d.]+ DPS$/)).not.toBeInTheDocument();
    });

    it("shows intellect's magic crit always, spell damage and resource pool only when it's a class primary", () => {
      hover("Intellect", {head: {identifier: "h", stats: {intellect: 140}}}, []);
      expect(screen.getByText("+84.0 effective Magic Crit Rating")).toBeInTheDocument();
      expect(screen.queryByText(/Spell Damage|Resource Pool/)).not.toBeInTheDocument();
    });

    it("also shows spell damage and resource pool when intellect is a class primary stat", () => {
      hover("Intellect", {head: {identifier: "h", stats: {intellect: 140}}}, ["intellect"]);
      expect(screen.getByText("+10.0 Spell Damage")).toBeInTheDocument();
      expect(screen.getByText("+1400 Resource Pool")).toBeInTheDocument();
    });

    it("shows stamina's max HP, always", () => {
      hover("Stamina", {head: {identifier: "h", stats: {stamina: 50}}}, []);
      expect(screen.getByText("600 Max HP")).toBeInTheDocument();
    });

    it("computes basic attack dps as ~1.0 for a fully naked character", () => {
      hover("Basic Attack DPS", {}, []);
      expect(statValue("Basic Attack DPS")).toBe("1.0");
      expect(screen.getByText("1.0 base")).toBeInTheDocument();
      expect(screen.getByText("+0.0% haste")).toBeInTheDocument();
      expect(screen.getByText("5.0% crit chance")).toBeInTheDocument();
      expect(screen.getByText("5.0% miss chance")).toBeInTheDocument();
    });

    it("adds the class damage stat's contribution to basic attack dps", () => {
      hover("Basic Attack DPS", {head: {identifier: "h", stats: {strength: 70}}}, ["strength"]);
      expect(statValue("Basic Attack DPS")).toBe("11.0");
      expect(screen.getByText("+10.0 from Strength")).toBeInTheDocument();
    });

    it("does not add a damage stat contribution when strength/agility aren't a class primary", () => {
      hover("Basic Attack DPS", {head: {identifier: "h", stats: {strength: 70}}}, []);
      expect(statValue("Basic Attack DPS")).toBe("1.0");
      expect(screen.queryByText(/from Strength/)).not.toBeInTheDocument();
    });

    it("scales basic attack dps by haste and crit rating", () => {
      hover("Basic Attack DPS", {head: {identifier: "h", stats: {haste_rating: 117.1}}}, []);
      expect(screen.getByText("+10.0% haste")).toBeInTheDocument();
      expect(statValue("Basic Attack DPS")).toBe("1.1");
    });
  });

  it("calls onClose when the close button is clicked", () => {
    let closed = false;
    render(<CharacterSheet open equippedItems={{}} onClose={() => { closed = true; }} />);
    fireEvent.click(screen.getByText("✕"));
    expect(closed).toBe(true);
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

    it("opens a candidate pane for an empty slot too", async () => {
      const fetchMock = stubFetch([
        { id: 3, identifier: "novice-boots", name: "Novice Boots", source_key: "sk-3", stats: {} },
      ]);

      render(
        <CharacterSheet
          open
          equippedItems={{}}
          characterItemsUrl="/play/characters/1/character_items.json"
          onClose={() => {}}
        />
      );

      fireEvent.click(screen.getAllByText("Empty")[0]);

      expect(fetchMock).toHaveBeenCalledWith("/play/characters/1/character_items.json?slot%5B%5D=head");
      await waitFor(() => expect(screen.getByText("Novice Boots")).toBeInTheDocument());
    });

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

    it("shows elvl per candidate and sorts by elvl descending", async () => {
      stubFetch([
        { id: 1, identifier: "worn-boots", name: "Worn Boots", source_key: "sk-1", elvl: 10, stats: {} },
        { id: 2, identifier: "master-boots", name: "Master Boots", source_key: "sk-2", elvl: 50, stats: {} },
        { id: 3, identifier: "novice-boots", name: "Novice Boots", source_key: "sk-3", elvl: 30, stats: {} },
      ]);

      render(
        <CharacterSheet open equippedItems={{}} characterItemsUrl="/play/characters/1/character_items.json" onClose={() => {}} />
      );

      fireEvent.click(screen.getAllByText("Empty")[0]);
      await waitFor(() => expect(screen.getByText("Master Boots")).toBeInTheDocument());

      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();

      const names = screen.getAllByText(/Boots$/).map(el => el.textContent);
      expect(names).toEqual(["Master Boots", "Novice Boots", "Worn Boots"]);
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
      await waitFor(() => expect(screen.getByText("Nothing")).toBeInTheDocument());
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
      await waitFor(() => expect(screen.getByText("Nothing")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Iron Helm"));
      expect(screen.queryByText("Nothing")).not.toBeInTheDocument();
    });

    it("shows a 'Nothing' row that unequips the slot", async () => {
      stubFetch([{ id: 5, identifier: "worn-helm", name: "Worn Helm", source_key: "sk-2", stats: {} }]);
      const equippedItems = {
        head: { identifier: "iron-helm", source_key: "sk-1", stats: {} },
      };
      const onEquip = vi.fn().mockResolvedValue(null);

      render(
        <CharacterSheet
          open
          equippedItems={equippedItems}
          characterItemsUrl="/play/characters/1/character_items.json"
          onEquip={onEquip}
          onClose={() => {}}
        />
      );

      fireEvent.click(screen.getByText("Iron Helm"));
      await waitFor(() => expect(screen.getByText("Nothing")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Nothing"));
      expect(onEquip).toHaveBeenCalledWith("head", null);
      await waitFor(() => expect(screen.queryByText("Nothing")).not.toBeInTheDocument());
    });

    it("equips a candidate item and closes the pane on success", async () => {
      stubFetch([{ id: 5, identifier: "worn-helm", name: "Worn Helm", source_key: "sk-2", stats: {} }]);
      const equippedItems = {
        head: { identifier: "iron-helm", source_key: "sk-1", stats: {} },
      };
      const onEquip = vi.fn().mockResolvedValue(null);

      render(
        <CharacterSheet
          open
          equippedItems={equippedItems}
          characterItemsUrl="/play/characters/1/character_items.json"
          onEquip={onEquip}
          onClose={() => {}}
        />
      );

      fireEvent.click(screen.getByText("Iron Helm"));
      await waitFor(() => expect(screen.getByText("Worn Helm")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Worn Helm"));
      expect(onEquip).toHaveBeenCalledWith("head", { id: 5, identifier: "worn-helm", name: "Worn Helm", source_key: "sk-2", stats: {} });
      await waitFor(() => expect(screen.queryByText("Worn Helm")).not.toBeInTheDocument());
    });

    it("shows an error and keeps the pane open when equipping fails", async () => {
      stubFetch([{ id: 5, identifier: "worn-helm", name: "Worn Helm", source_key: "sk-2", stats: {} }]);
      const equippedItems = {
        head: { identifier: "iron-helm", source_key: "sk-1", stats: {} },
      };
      const onEquip = vi.fn().mockResolvedValue("cannot equip a chest item into head");

      render(
        <CharacterSheet
          open
          equippedItems={equippedItems}
          characterItemsUrl="/play/characters/1/character_items.json"
          onEquip={onEquip}
          onClose={() => {}}
        />
      );

      fireEvent.click(screen.getByText("Iron Helm"));
      await waitFor(() => expect(screen.getByText("Worn Helm")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Worn Helm"));
      await waitFor(() => expect(screen.getByText("cannot equip a chest item into head")).toBeInTheDocument());
      expect(screen.getByText("Worn Helm")).toBeInTheDocument();
    });
  });
});
