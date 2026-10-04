import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import AbilityIcon from "../AbilityIcon";

describe("AbilityIcon", () => {
  it("renders an <img> when the ability has an iconURL", () => {
    render(<AbilityIcon ability={{name: "Slash", iconURL: "slash.svg"}} className="power-slot-icon" onClick={vi.fn()} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "slash.svg");
    expect(img).toHaveClass("power-slot-icon");
  });

  it("tints the icon with iconColor by masking a div filled with that color", () => {
    render(<AbilityIcon ability={{name: "Slash", iconURL: "slash.svg", iconColor: "ff8a3d"}} className="power-slot-icon" onClick={vi.fn()} />);

    const icon = screen.getByRole("img", {name: "Slash"});
    expect(icon.tagName).toBe("DIV");
    expect(icon).toHaveClass("power-slot-icon");
    expect(icon.style.backgroundColor).toBe("rgb(255, 138, 61)");
  });

  it("renders a clickable fallback badge with the ability's initials when there is no iconURL", () => {
    render(<AbilityIcon ability={{name: "Enrage"}} className="power-slot-icon" onClick={vi.fn()} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("EN");
    expect(button).toHaveClass("power-slot-icon");
    expect(button).toHaveClass("ability-icon-fallback");
  });

  it("falls back to '?' when the ability has neither an iconURL nor a name", () => {
    render(<AbilityIcon ability={{}} className="power-slot-icon" onClick={vi.fn()} />);

    expect(screen.getByRole("button")).toHaveTextContent("?");
  });

  it("fires onClick from the fallback badge same as from a real icon", () => {
    const onClick = vi.fn();
    render(<AbilityIcon ability={{name: "Enrage"}} className="power-slot-icon" onClick={onClick} />);

    fireEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
