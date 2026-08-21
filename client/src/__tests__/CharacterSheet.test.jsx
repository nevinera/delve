import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
});
