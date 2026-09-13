import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import ItemEditor from "../ItemEditor";
import {commitFiles, GithubAuthError} from "../../github/commitFiles";
import {validateItem} from "../../validators/validateContent";

vi.mock("../../github/commitFiles", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, commitFiles: vi.fn()};
});

vi.mock("../../validators/validateContent", () => ({
  validateItem: vi.fn(),
}));

const initialItem = {
  identifier: "sword-of-doom", name: "Sword of Doom", slot: "main_hand", weaponType: "sword",
  elvl: 100, primary: "strength", secondaries: ["stamina"], description: "", icon_url: null,
};

describe("ItemEditor", () => {
  it("flows a name edit from the fields panel into the item state and the preview", () => {
    render(<ItemEditor itemKey="sword-of-doom" initialItem={initialItem} />);

    fireEvent.change(screen.getByDisplayValue("Sword of Doom"), {target: {value: "Sword of Ruin"}});

    expect(screen.getByDisplayValue("Sword of Ruin")).toBeInTheDocument();
    expect(screen.getAllByText("Sword of Ruin").length).toBeGreaterThan(0);
  });

  it("clears weaponType and primary when switching to a ring slot", () => {
    render(<ItemEditor itemKey="sword-of-doom" initialItem={initialItem} />);

    fireEvent.change(screen.getByDisplayValue("Main_hand"), {target: {value: "ring"}});

    expect(screen.queryByText("Weapon Type")).not.toBeInTheDocument();
    expect(screen.queryByText("Primary")).not.toBeInTheDocument();
  });

  it("caps the secondaries checkboxes at the slot's max and disables the rest", () => {
    const ringItem = {...initialItem, slot: "ring", primary: null, weaponType: null, secondaries: ["stamina", "crit_rating"]};
    render(<ItemEditor itemKey="ring-of-doom" initialItem={ringItem} />);

    expect(screen.getByText("Secondaries (2/2)")).toBeInTheDocument();
    const hasteCheckbox = screen.getByRole("checkbox", {name: "Haste_rating"});
    expect(hasteCheckbox).toBeDisabled();
  });

  it("validates, then allows saving once valid", async () => {
    validateItem.mockResolvedValue({valid: true});
    commitFiles.mockResolvedValue({commitSha: "abc", branch: "main"});

    render(<ItemEditor itemKey="sword-of-doom" initialItem={initialItem} />);

    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", {name: "Save"}));
    await waitFor(() => expect(commitFiles).toHaveBeenCalledWith(
      {"items/sword-of-doom.json": initialItem},
      {message: "Update Sword of Doom"}
    ));
    await screen.findByText("Saved.");
  });

  it("shows the validation error message and re-disables Save", async () => {
    validateItem.mockResolvedValue({valid: false, error: {message: "elvl must be at least 0", path: "$.elvl"}});

    render(<ItemEditor itemKey="sword-of-doom" initialItem={initialItem} />);
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));

    await screen.findByText("elvl must be at least 0");
    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
  });

  it("redirects to the GitHub reauth URL on a GithubAuthError during save", async () => {
    validateItem.mockResolvedValue({valid: true});
    commitFiles.mockRejectedValue(new GithubAuthError("reauth_required", "/github/reauth"));
    delete window.location;
    window.location = {href: ""};

    render(<ItemEditor itemKey="sword-of-doom" initialItem={initialItem} />);
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });
});
