import {describe, it, expect} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ZoneEditor from "../ZoneEditor";

const initialZone = {name: "Goblin Cave"};

describe("ZoneEditor", () => {
  it("flows a name edit from the field into the zone state", () => {
    render(<ZoneEditor initialZone={initialZone} />);

    fireEvent.change(screen.getByDisplayValue("Goblin Cave"), {target: {value: "Goblin Warren"}});

    expect(screen.getByDisplayValue("Goblin Warren")).toBeInTheDocument();
  });

  it("does not persist the edit anywhere - saving is deferred to step 11", () => {
    // No commitFiles mock, no Save button to click - an edit here only
    // ever touches in-memory React state until step 11 adds saving.
    render(<ZoneEditor initialZone={initialZone} />);

    expect(screen.queryByRole("button", {name: "Save"})).not.toBeInTheDocument();
  });
});
