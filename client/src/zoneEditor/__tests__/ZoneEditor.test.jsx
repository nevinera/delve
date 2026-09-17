import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import ZoneEditor from "../ZoneEditor";
import {commitFiles, GithubAuthError} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, commitFiles: vi.fn()};
});

const initialZone = {name: "Goblin Cave"};

describe("ZoneEditor", () => {
  it("flows a name edit from the field into the zone state", () => {
    render(<ZoneEditor zoneKey="goblin-cave" initialZone={initialZone} />);

    fireEvent.change(screen.getByDisplayValue("Goblin Cave"), {target: {value: "Goblin Warren"}});

    expect(screen.getByDisplayValue("Goblin Warren")).toBeInTheDocument();
  });

  it("saves without needing a validate step first", async () => {
    commitFiles.mockResolvedValue({commitSha: "abc", branch: "main"});

    render(<ZoneEditor zoneKey="goblin-cave" initialZone={initialZone} />);

    expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    await waitFor(() => expect(commitFiles).toHaveBeenCalledWith(
      {"zones/goblin-cave/goblin-cave.json": initialZone},
      {message: "Update Goblin Cave"}
    ));
    await screen.findByText("Saved.");
  });

  it("shows a save error message on a plain save failure", async () => {
    commitFiles.mockRejectedValue(new Error("network blip"));

    render(<ZoneEditor zoneKey="goblin-cave" initialZone={initialZone} />);
    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    await screen.findByText("network blip");
  });

  it("redirects to the GitHub reauth URL on a GithubAuthError during save", async () => {
    commitFiles.mockRejectedValue(new GithubAuthError("reauth_required", "/github/reauth"));
    delete window.location;
    window.location = {href: ""};

    render(<ZoneEditor zoneKey="goblin-cave" initialZone={initialZone} />);
    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });
});
