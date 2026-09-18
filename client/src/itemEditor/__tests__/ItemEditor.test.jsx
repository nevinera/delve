import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import ItemEditor from "../ItemEditor";
import {commitFiles, GithubAuthError as CommitGithubAuthError} from "../../github/commitFiles";
import {GithubClient, GithubAuthError} from "../../github/delve-github";
import {validateItem} from "../../validators/validateContent";

vi.mock("../../github/commitFiles", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, commitFiles: vi.fn()};
});

vi.mock("../../github/delve-github", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, GithubClient: vi.fn()};
});

vi.mock("../../validators/validateContent", () => ({
  validateItem: vi.fn(),
}));

const initialItem = {
  identifier: "sword-of-doom", name: "Sword of Doom", slot: "main_hand", weaponType: "sword",
  elvl: 100, primary: "strength", secondaries: ["stamina"], description: "", icon_url: null,
};

function mockFetchFile(implementation) {
  GithubClient.mockImplementation(function () { return {fetchFile: vi.fn(implementation)}; });
}

async function renderLoaded(itemData = initialItem) {
  mockFetchFile(async () => JSON.stringify(itemData));
  render(<ItemEditor itemKey={itemData.identifier ?? "sword-of-doom"} />);
  await screen.findByDisplayValue(itemData.name);
}

describe("ItemEditor", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows a loading state, then the fields panel once the fetch resolves", async () => {
    let resolveFetch;
    mockFetchFile(() => new Promise((resolve) => (resolveFetch = resolve)));

    render(<ItemEditor itemKey="sword-of-doom" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveFetch(JSON.stringify(initialItem));
    await waitFor(() => expect(screen.getByDisplayValue("Sword of Doom")).toBeInTheDocument());
  });

  it("falls back to a blank item when the file doesn't exist yet (404 -> null)", async () => {
    mockFetchFile(async () => null);

    render(<ItemEditor itemKey="new_sword" />);

    await screen.findByDisplayValue("New Sword");
  });

  it("shows a load error rather than a blank/loading state when the fetch fails", async () => {
    mockFetchFile(async () => {
      throw new Error("network down");
    });

    render(<ItemEditor itemKey="sword-of-doom" />);

    await screen.findByText(/Failed to load: network down/);
  });

  it("redirects to the GitHub reauth URL when the load itself hits a GithubAuthError", async () => {
    mockFetchFile(async () => {
      throw new GithubAuthError("reauth_required", "/github/reauth");
    });
    delete window.location;
    window.location = {href: ""};

    render(<ItemEditor itemKey="sword-of-doom" />);

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });

  it("flows a name edit from the fields panel into the item state and the preview", async () => {
    await renderLoaded();

    fireEvent.change(screen.getByDisplayValue("Sword of Doom"), {target: {value: "Sword of Ruin"}});

    expect(screen.getByDisplayValue("Sword of Ruin")).toBeInTheDocument();
    expect(screen.getAllByText("Sword of Ruin").length).toBeGreaterThan(0);
  });

  it("clears weaponType and primary when switching to a ring slot", async () => {
    await renderLoaded();

    fireEvent.change(screen.getByDisplayValue("Main_hand"), {target: {value: "ring"}});

    expect(screen.queryByText("Weapon Type")).not.toBeInTheDocument();
    expect(screen.queryByText("Primary")).not.toBeInTheDocument();
  });

  it("caps the secondaries checkboxes at the slot's max and disables the rest", async () => {
    const ringItem = {...initialItem, slot: "ring", primary: null, weaponType: null, secondaries: ["stamina", "crit_rating"]};
    await renderLoaded(ringItem);

    expect(screen.getByText("Secondaries (2/2)")).toBeInTheDocument();
    const hasteCheckbox = screen.getByRole("checkbox", {name: "Haste_rating"});
    expect(hasteCheckbox).toBeDisabled();
  });

  it("validates, then allows saving once valid", async () => {
    validateItem.mockResolvedValue({valid: true});
    commitFiles.mockResolvedValue({commitSha: "abc", branch: "main"});
    await renderLoaded();

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
    await renderLoaded();

    fireEvent.click(screen.getByRole("button", {name: "Validate"}));

    await screen.findByText("elvl must be at least 0");
    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
  });

  it("redirects to the GitHub reauth URL on a GithubAuthError during save", async () => {
    validateItem.mockResolvedValue({valid: true});
    commitFiles.mockRejectedValue(new CommitGithubAuthError("reauth_required", "/github/reauth"));
    delete window.location;
    window.location = {href: ""};
    await renderLoaded();

    fireEvent.click(screen.getByRole("button", {name: "Validate"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });
});
