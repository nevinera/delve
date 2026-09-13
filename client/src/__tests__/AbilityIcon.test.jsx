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
