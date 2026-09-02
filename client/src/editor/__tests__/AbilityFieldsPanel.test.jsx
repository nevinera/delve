import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import AbilityFieldsPanel from "../AbilityFieldsPanel";

const ability = {
  name: "Firebolt",
  iconURL: "../graphics/icons/firebolt.svg",
  castTime: null,
  globalCooldown: 1.0,
  speed: 60.0,
  maxRange: 40.0,
  graphicEffects: [{sourceURL: "../graphics/animations/firebolt.sprites2x2.png", duration: 0.5, when: "immediate"}],
  effects: [{type: "harm", affects: "bTarget", amount: [89.0, 140.0], tags: ["magic", "ranged"]}],
};

describe("AbilityFieldsPanel", () => {
  it("renders name as read-only plain text, not an input", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
    expect(screen.getByText("Firebolt")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Firebolt")).not.toBeInTheDocument();
  });

  it("renders every recognized field even when the ability lacks it, e.g. cooldown", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
    expect(screen.getByText("Cooldown")).toBeInTheDocument();
  });

  it("renders iconURL/castTime/globalCooldown/cooldown/maxRange/speed as editable inputs", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
    expect(screen.getByDisplayValue("../graphics/icons/firebolt.svg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1")).toBeInTheDocument(); // globalCooldown
    expect(screen.getByDisplayValue("60")).toBeInTheDocument(); // speed
    expect(screen.getByDisplayValue("40")).toBeInTheDocument(); // maxRange
  });

  it("dispatches SET_FIELD with a string when an editable text field changes", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("../graphics/icons/firebolt.svg"), {target: {value: "../graphics/icons/new.svg"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "iconURL", value: "../graphics/icons/new.svg"});
  });

  it("dispatches SET_FIELD with a parsed number when an editable number field changes", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("60"), {target: {value: "75"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "speed", value: 75});
  });

  it("dispatches SET_FIELD with null when a number field is cleared", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("40"), {target: {value: ""}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "maxRange", value: null});
  });

  it("renders a file upload input for iconURL and calls onUploadAsset with the chosen file", () => {
    const onUploadAsset = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={onUploadAsset} onClearAsset={() => {}} />);
    const file = new File(["fake-bytes"], "new-icon.png", {type: "image/png"});
    const fileInput = document.querySelector('input[type="file"]');

    fireEvent.change(fileInput, {target: {files: [file]}});

    expect(onUploadAsset).toHaveBeenCalledWith("iconURL", file);
  });

  it("does not show a Restore button when there is no override for the field", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
    expect(screen.queryByRole("button", {name: "Restore"})).not.toBeInTheDocument();
  });

  it("shows a Restore button when an override is active and calls onClearAsset when clicked", () => {
    const onClearAsset = vi.fn();
    render(
      <AbilityFieldsPanel
        ability={ability}
        dispatch={() => {}}
        assetOverrides={{iconURL: "blob:fake-url"}}
        onUploadAsset={() => {}}
        onClearAsset={onClearAsset}
      />
    );
    fireEvent.click(screen.getByRole("button", {name: "Restore"}));
    expect(onClearAsset).toHaveBeenCalledWith("iconURL");
  });

  it("renders collapsible sections for each array field with per-entry summaries", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
    expect(screen.getByText("Graphic effects (1)")).toBeInTheDocument();
    expect(screen.getByText("Effects (1)")).toBeInTheDocument();
    expect(screen.getByText("1. harm")).toBeInTheDocument();
    expect(screen.getByDisplayValue("magic, ranged")).toBeInTheDocument();
  });

  describe("entry fields", () => {
    it("renders enum fields (when) as a select with the current value chosen", () => {
      render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
      expect(screen.getByDisplayValue("immediate").tagName).toEqual("SELECT");
    });

    it("dispatches UPDATE_ENTRY_FIELD when a select (when) changes", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
      fireEvent.change(screen.getByDisplayValue("immediate"), {target: {value: "impact"}});
      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "graphicEffects", index: 0, field: "when", value: "impact"});
    });

    it("dispatches UPDATE_ENTRY_FIELD with a collapsed scalar when both range endpoints match", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
      fireEvent.change(screen.getByDisplayValue("140"), {target: {value: "89"}});
      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "effects", index: 0, field: "amount", value: 89});
    });

    it("dispatches UPDATE_ENTRY_FIELD with an array when range endpoints differ", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
      fireEvent.change(screen.getByDisplayValue("89"), {target: {value: "50"}});
      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "effects", index: 0, field: "amount", value: [50, 140]});
    });

    it("dispatches UPDATE_ENTRY_FIELD with a parsed tag array when tags changes", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
      fireEvent.change(screen.getByDisplayValue("magic, ranged"), {target: {value: "magic, ranged, aoe"}});
      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "effects", index: 0, field: "tags", value: ["magic", "ranged", "aoe"]});
    });

    it("dispatches UPDATE_ENTRY_FIELD when a plain numeric entry field changes", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
      fireEvent.change(screen.getByDisplayValue("0.5"), {target: {value: "0.8"}});
      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "graphicEffects", index: 0, field: "duration", value: 0.8});
    });

    it("renders the nested status object read-only, not as an input", () => {
      const withStatus = {
        ...ability,
        effects: [{type: "status", affects: "self", duration: 5.0, status: {name: "Focused", treatAs: "buff"}}],
      };
      render(<AbilityFieldsPanel ability={withStatus} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} />);
      expect(screen.getByText("Name: Focused; Treat as: buff")).toBeInTheDocument();
    });
  });
});
