import {useState} from "react";
import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent, act} from "@testing-library/react";
import AbilityFieldsPanel from "../AbilityFieldsPanel";

function AddEntryWrapper() {
  // Stands in for AbilityEditor, which is what actually re-renders
  // AbilityFieldsPanel with the post-dispatch ability - AbilityFieldsPanel
  // alone has no way to update `ability`.
  const [state, setState] = useState({name: "Bare Ability", castTime: null, globalCooldown: 1.0, effects: []});
  function dispatch(action) {
    setState((s) => (action.type === "ADD_ENTRY" ? {...s, [action.section]: [...(s[action.section] ?? []), action.entry]} : s));
  }
  return <AbilityFieldsPanel ability={state} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />;
}

const ability = {
  name: "Firebolt",
  description: "A bolt of fire.",
  iconURL: "../graphics/icons/firebolt.svg",
  castTime: null,
  globalCooldown: 1.0,
  speed: 60.0,
  maxRange: 40.0,
  tags: ["harmful", "class_druid"],
  graphicEffects: [{sourceURL: "../graphics/animations/firebolt.sprites2x2.png", duration: 0.5, when: "immediate"}],
  effects: [{type: "harm", affects: "bTarget", amount: [89.0, 140.0], tags: ["magic", "ranged"]}],
};

describe("AbilityFieldsPanel", () => {
  it("renders every recognized field even when the ability lacks it, e.g. cooldown", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
    expect(screen.getByText("Cooldown")).toBeInTheDocument();
  });

  it("renders name/description/iconURL/castTime/globalCooldown/cooldown/maxRange/speed as editable inputs", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
    expect(screen.getByDisplayValue("Firebolt")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A bolt of fire.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("../graphics/icons/firebolt.svg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1")).toBeInTheDocument(); // globalCooldown
    expect(screen.getByDisplayValue("60")).toBeInTheDocument(); // speed
    expect(screen.getByDisplayValue("40")).toBeInTheDocument(); // maxRange
  });

  it("dispatches SET_FIELD with a string when the name field changes", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("Firebolt"), {target: {value: "Frostbolt"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "name", value: "Frostbolt"});
  });

  it("dispatches SET_FIELD with a string when an editable text field changes", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("../graphics/icons/firebolt.svg"), {target: {value: "../graphics/icons/new.svg"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "iconURL", value: "../graphics/icons/new.svg"});
  });

  it("dispatches SET_FIELD with a parsed number when an editable number field changes", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("60"), {target: {value: "75"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "speed", value: 75});
  });

  it("dispatches SET_FIELD with null when a number field is cleared", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("40"), {target: {value: ""}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "maxRange", value: null});
  });

  it("renders top-level tags as a comma-joined editable field", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
    expect(screen.getByDisplayValue("harmful, class_druid")).toBeInTheDocument();
  });

  it("dispatches SET_FIELD with a parsed tag array when the top-level tags field changes", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("harmful, class_druid"), {target: {value: "harmful, class_druid, aoe"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "tags", value: ["harmful", "class_druid", "aoe"]});
  });

  it("renders a file upload input for iconURL and calls onUploadAsset with the chosen file", () => {
    const onUploadAsset = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={onUploadAsset} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
    const file = new File(["fake-bytes"], "new-icon.png", {type: "image/png"});
    const fileInput = document.querySelector('input[type="file"]');

    fireEvent.change(fileInput, {target: {files: [file]}});

    expect(onUploadAsset).toHaveBeenCalledWith("iconURL", file);
  });

  it("does not show a Restore button when there is no override for the field", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
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
        onRemoveEntry={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", {name: "Restore"}));
    expect(onClearAsset).toHaveBeenCalledWith("iconURL");
  });

  it("renders a heading for each entry, sorted graphic/sound/effect, with no folding", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
    expect(screen.getByRole("heading", {name: "Graphic effect 1: immediate"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Effect 1: harm"})).toBeInTheDocument();
    expect(document.querySelector("details")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("magic, ranged")).toBeInTheDocument();
  });

  it("always shows all three Add buttons, even for an ability with no effects at all", () => {
    const bare = {name: "Bare Ability", castTime: null, globalCooldown: 1.0};
    render(<AbilityFieldsPanel ability={bare} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
    expect(screen.getByRole("button", {name: "+ Add Graphic effect"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "+ Add Sound effect"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "+ Add Effect"})).toBeInTheDocument();
  });

  describe("entry fields", () => {
    it("renders enum fields (when) as a select with the current value chosen", () => {
      render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
      expect(screen.getByDisplayValue("immediate").tagName).toEqual("SELECT");
    });

    it("dispatches UPDATE_ENTRY_FIELD when a select (when) changes", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
      fireEvent.change(screen.getByDisplayValue("immediate"), {target: {value: "impact"}});
      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "graphicEffects", index: 0, field: "when", value: "impact"});
    });

    it("dispatches UPDATE_ENTRY_FIELD with a collapsed scalar when both range endpoints match", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
      fireEvent.change(screen.getByDisplayValue("140"), {target: {value: "89"}});
      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "effects", index: 0, field: "amount", value: 89});
    });

    it("dispatches UPDATE_ENTRY_FIELD with an array when range endpoints differ", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
      fireEvent.change(screen.getByDisplayValue("89"), {target: {value: "50"}});
      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "effects", index: 0, field: "amount", value: [50, 140]});
    });

    it("dispatches UPDATE_ENTRY_FIELD with a parsed tag array when tags changes", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
      fireEvent.change(screen.getByDisplayValue("magic, ranged"), {target: {value: "magic, ranged, aoe"}});
      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "effects", index: 0, field: "tags", value: ["magic", "ranged", "aoe"]});
    });

    it("keeps a trailing comma and space visible while typing a new tag, rather than stripping it immediately", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
      const input = screen.getByDisplayValue("magic, ranged");
      fireEvent.change(input, {target: {value: "magic, ranged, "}});
      expect(input).toHaveValue("magic, ranged, ");
      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "effects", index: 0, field: "tags", value: ["magic", "ranged"]});
    });

    it("dispatches UPDATE_ENTRY_FIELD when a plain numeric entry field changes", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
      fireEvent.change(screen.getByDisplayValue("0.5"), {target: {value: "0.8"}});
      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "graphicEffects", index: 0, field: "duration", value: 0.8});
    });

    it("renders an image-accepting upload for a graphicEffects sourceURL and calls onUploadAsset with a scoped key", () => {
      const onUploadAsset = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={onUploadAsset} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
      // index 1: index 0 is the top-level iconURL upload, also accept="image/*"
      const fileInput = document.querySelectorAll('input[type="file"][accept="image/*"]')[1];
      const file = new File(["fake-bytes"], "new-effect.png", {type: "image/png"});

      fireEvent.change(fileInput, {target: {files: [file]}});

      expect(onUploadAsset).toHaveBeenCalledWith("graphicEffects[0].sourceURL", file);
    });

    it("renders an audio-accepting upload for a soundEffects sourceURL", () => {
      const abilityWithSound = {...ability, soundEffects: [{sourceURL: "../audio/firespell1.ogg", duration: 1.8, when: "immediate"}]};
      const onUploadAsset = vi.fn();
      render(<AbilityFieldsPanel ability={abilityWithSound} dispatch={() => {}} assetOverrides={{}} onUploadAsset={onUploadAsset} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
      const fileInput = document.querySelector('input[type="file"][accept="audio/*"]');
      const file = new File(["fake-bytes"], "new-sound.ogg", {type: "audio/ogg"});

      fireEvent.change(fileInput, {target: {files: [file]}});

      expect(onUploadAsset).toHaveBeenCalledWith("soundEffects[0].sourceURL", file);
    });

    it("shows a per-entry Restore button only for the overridden entry", () => {
      const twoEffects = {
        ...ability,
        graphicEffects: [
          {sourceURL: "a.png", duration: 0.1, when: "immediate"},
          {sourceURL: "b.png", duration: 0.2, when: "immediate"},
        ],
      };
      const onClearAsset = vi.fn();
      render(
        <AbilityFieldsPanel
          ability={twoEffects}
          dispatch={() => {}}
          assetOverrides={{"graphicEffects[1].sourceURL": "blob:local-b"}}
          onUploadAsset={() => {}}
          onClearAsset={onClearAsset}
          onRemoveEntry={() => {}}
        />
      );

      expect(screen.getAllByRole("button", {name: "Restore"})).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", {name: "Restore"}));
      expect(onClearAsset).toHaveBeenCalledWith("graphicEffects[1].sourceURL");
    });

    it("shows spriteColumns/spriteRows as editable fields even on a graphicEffect that never had them", () => {
      // e.g. the ability's original effect was a plain image, and the user
      // uploaded an animated sprite sheet to replace it - there needs to be
      // somewhere to declare the new grid dimensions.
      const plainImageAbility = {...ability, graphicEffects: [{sourceURL: "punch-impact.webp", duration: 0.3}]};
      render(<AbilityFieldsPanel ability={plainImageAbility} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);

      expect(screen.getByText("Sprite columns")).toBeInTheDocument();
      expect(screen.getByText("Sprite rows")).toBeInTheDocument();
      expect(screen.getByText("Sprite frame rate")).toBeInTheDocument();
    });

    it("dispatches UPDATE_ENTRY_FIELD when a previously-unset spriteColumns field is filled in", () => {
      const dispatch = vi.fn();
      const plainImageAbility = {...ability, graphicEffects: [{sourceURL: "punch-impact.webp", duration: 0.3}]};
      render(<AbilityFieldsPanel ability={plainImageAbility} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);

      const row = screen.getByText("Sprite columns").closest("tr");
      const input = row.querySelector("input");
      fireEvent.change(input, {target: {value: "3"}});

      expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ENTRY_FIELD", section: "graphicEffects", index: 0, field: "spriteColumns", value: 3});
    });

    it("renders the nested status object read-only, not as an input", () => {
      const withStatus = {
        ...ability,
        effects: [{type: "status", affects: "self", duration: 5.0, status: {name: "Focused", treatAs: "buff"}}],
      };
      render(<AbilityFieldsPanel ability={withStatus} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);
      expect(screen.getByText("Name: Focused; Treat as: buff")).toBeInTheDocument();
    });
  });

  describe("adding and removing entries", () => {
    it("dispatches ADD_ENTRY with a placeholder graphicEffects entry when Add Graphic effect is clicked", () => {
      const dispatch = vi.fn();
      const bare = {name: "Bare Ability", castTime: null, globalCooldown: 1.0};
      render(<AbilityFieldsPanel ability={bare} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);

      fireEvent.click(screen.getByRole("button", {name: "+ Add Graphic effect"}));

      expect(dispatch).toHaveBeenCalledWith({
        type: "ADD_ENTRY",
        section: "graphicEffects",
        entry: {sourceURL: "", duration: 0.3, from: "self", when: "immediate", condition: "always"},
      });
    });

    it("dispatches ADD_ENTRY with a placeholder harm effect when Add Effect is clicked", () => {
      const dispatch = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);

      fireEvent.click(screen.getByRole("button", {name: "+ Add Effect"}));

      expect(dispatch).toHaveBeenCalledWith({
        type: "ADD_ENTRY",
        section: "effects",
        entry: {type: "harm", affects: "bTarget", amount: 10.0, range: 5.0},
      });
    });

    it("renders a newly-added entry's fields immediately, with no expand step needed", () => {
      const dispatch = vi.fn();
      const bare = {name: "Bare Ability", castTime: null, globalCooldown: 1.0};
      const {rerender} = render(<AbilityFieldsPanel ability={bare} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);

      fireEvent.click(screen.getByRole("button", {name: "+ Add Effect"}));
      const addedEntry = dispatch.mock.calls[0][0].entry;
      rerender(<AbilityFieldsPanel ability={{...bare, effects: [addedEntry]}} dispatch={dispatch} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />);

      expect(screen.getByRole("heading", {name: "Effect 1: harm"})).toBeInTheDocument();
      expect(screen.getByDisplayValue("bTarget")).toBeInTheDocument();
    });

    it("scrolls the newly-added entry into view once it renders", () => {
      const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
      render(<AddEntryWrapper />);

      fireEvent.click(screen.getByRole("button", {name: "+ Add Effect"}));

      const heading = screen.getByRole("heading", {name: "Effect 1: harm"});
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(heading.closest(".entry-block"));

      scrollIntoView.mockRestore();
    });

    it("highlights the newly-added entry, then removes the highlight after a delay", () => {
      vi.useFakeTimers();
      render(<AddEntryWrapper />);

      act(() => {
        fireEvent.click(screen.getByRole("button", {name: "+ Add Effect"}));
      });

      const block = screen.getByRole("heading", {name: "Effect 1: harm"}).closest(".entry-block");
      expect(block).toHaveClass("entry-block-highlight");

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(block).not.toHaveClass("entry-block-highlight");

      vi.useRealTimers();
    });

    it("calls onRemoveEntry with the section and index when Remove is clicked", () => {
      const onRemoveEntry = vi.fn();
      render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={onRemoveEntry} />);

      fireEvent.click(screen.getAllByRole("button", {name: "Remove"})[0]);

      expect(onRemoveEntry).toHaveBeenCalledWith("graphicEffects", 0);
    });
  });
});
