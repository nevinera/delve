import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import ZoneValidateBar from "../ZoneValidateBar";
import {resolveZoneRefs} from "../resolveZoneRefs";
import {validateZone} from "../../validators/validateContent";

vi.mock("../resolveZoneRefs", () => ({
  resolveZoneRefs: vi.fn(),
}));

vi.mock("../../validators/validateContent", () => ({
  validateZone: vi.fn(),
}));

const zoneData = {name: "Goblin Cave", maps: []};

describe("ZoneValidateBar", () => {
  beforeEach(() => {
    resolveZoneRefs.mockReset();
    validateZone.mockReset();
  });

  it("resolves $refs relative to the zone's own directory, then posts the resolved form", async () => {
    resolveZoneRefs.mockResolvedValue({name: "Goblin Cave", maps: [{identifier: "cave_entrance"}]});
    validateZone.mockResolvedValue({valid: true});

    render(<ZoneValidateBar zoneData={zoneData} zoneKey="goblin-cave" />);
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));

    await screen.findByText("Valid.");

    expect(resolveZoneRefs).toHaveBeenCalledWith(zoneData, "zones/goblin-cave");
    expect(validateZone).toHaveBeenCalledWith({name: "Goblin Cave", maps: [{identifier: "cave_entrance"}]});
  });

  it("shows the validator's error message when the resolved zone is invalid", async () => {
    resolveZoneRefs.mockResolvedValue({});
    validateZone.mockResolvedValue({valid: false, error: {message: "elvl is required", path: "$.elvl"}});

    render(<ZoneValidateBar zoneData={zoneData} zoneKey="goblin-cave" />);
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));

    await screen.findByText("elvl is required");
  });

  it("shows a resolution failure (e.g. a missing $ref target) as an error too", async () => {
    resolveZoneRefs.mockRejectedValue(new Error("Could not resolve $ref: zones/goblin-cave/missing/missing.json"));

    render(<ZoneValidateBar zoneData={zoneData} zoneKey="goblin-cave" />);
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));

    await screen.findByText(/Could not resolve \$ref/);
    expect(validateZone).not.toHaveBeenCalled();
  });

  it("disables the button and shows a validating label while in flight", async () => {
    let resolveRefsPromise;
    resolveZoneRefs.mockImplementation(() => new Promise((resolve) => { resolveRefsPromise = resolve; }));

    render(<ZoneValidateBar zoneData={zoneData} zoneKey="goblin-cave" />);
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));

    expect(await screen.findByRole("button", {name: "Validating…"})).toBeDisabled();

    resolveRefsPromise({});
    validateZone.mockResolvedValue({valid: true});
    await waitFor(() => expect(screen.getByRole("button", {name: "Validate"})).not.toBeDisabled());
  });
});
