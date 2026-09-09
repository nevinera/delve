import {describe, it, expect, vi, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import ClassEditor from "../ClassEditor";
import {commitFiles, GithubAuthError} from "../../github/commitFiles";

vi.mock("../../github/commitFiles", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, commitFiles: vi.fn()};
});

// ClassPreviewPane mounts a real Three.js WebGLRenderer via AbilityPreviewCanvas,
// which jsdom can't back - stub it so this test can exercise the reducer wiring
// (fields <-> class state) in isolation, same approach as AbilityEditor.test.jsx.
vi.mock("../ClassPreviewPane", () => ({
  default: ({powers}) => <div data-testid="preview-powers">{JSON.stringify(powers)}</div>,
}));

const initialClass = {
  name: "Puncher", description: "", colors: {major: "888888", minor: "CCCCCC"},
  resources: [], powers: [], primaryStats: [], secondaryStats: [], wields: [],
};

const availableAbilities = {
  "classes/puncher/punch": {ability: {name: "Punch"}, assetMap: {}},
};

describe("ClassEditor", () => {
  it("flows a name edit from the fields panel into the class state", () => {
    render(<ClassEditor classKey="puncher" initialClass={initialClass} availableAbilities={{}} stockAssets={{}} />);

    fireEvent.change(screen.getByDisplayValue("Puncher"), {target: {value: "Brawler"}});

    expect(screen.getByDisplayValue("Brawler")).toBeInTheDocument();
  });

  it("adds a power slot's $ref when an ability is picked from an empty slot", () => {
    render(<ClassEditor classKey="puncher" initialClass={initialClass} availableAbilities={availableAbilities} stockAssets={{}} />);
    expect(screen.getByTestId("preview-powers")).toHaveTextContent("[]");

    fireEvent.change(screen.getAllByRole("combobox").find((el) => el.closest("tr")?.textContent.includes("Slot 1")), {
      target: {value: "classes/puncher/punch"},
    });

    const powers = JSON.parse(screen.getByTestId("preview-powers").textContent);
    expect(powers).toEqual([{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "power"}]);
  });

  it("clears a filled slot back to an empty array", () => {
    const withPower = {...initialClass, powers: [{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "power"}]};
    render(<ClassEditor classKey="puncher" initialClass={withPower} availableAbilities={availableAbilities} stockAssets={{}} />);

    fireEvent.click(screen.getByRole("button", {name: "Clear"}));

    expect(screen.getByTestId("preview-powers")).toHaveTextContent("[]");
  });

  describe("saving", () => {
    beforeEach(() => {
      commitFiles.mockReset();
    });

    it("commits the class under classes/<key>.json and shows a success message", async () => {
      commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
      render(<ClassEditor classKey="puncher" initialClass={initialClass} availableAbilities={{}} stockAssets={{}} />);

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
      expect(commitFiles).toHaveBeenCalledWith({"classes/puncher.json": initialClass}, {message: "Update Puncher"});
    });

    it("shows an error message when the commit fails", async () => {
      commitFiles.mockRejectedValue(new Error("network exploded"));
      render(<ClassEditor classKey="puncher" initialClass={initialClass} availableAbilities={{}} stockAssets={{}} />);

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(screen.getByText("network exploded")).toBeInTheDocument());
    });

    it("redirects to the reported URL instead of showing an error when GitHub auth is required", async () => {
      commitFiles.mockRejectedValue(new GithubAuthError("reauth_required", "/github/reauth"));
      const originalLocation = window.location;
      delete window.location;
      window.location = {href: ""};

      render(<ClassEditor classKey="puncher" initialClass={initialClass} availableAbilities={{}} stockAssets={{}} />);
      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(window.location.href).toEqual("/github/reauth"));

      window.location = originalLocation;
    });
  });
});
