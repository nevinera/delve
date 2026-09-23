import {useState} from "react";
import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent, act} from "@testing-library/react";
import AbilityFieldsPanel from "../AbilityFieldsPanel";
import {AbilityDraft} from "../AbilityDraft";

function AddEntryWrapper() {
  // Stands in for AbilityEditor, which is what actually re-renders
  // AbilityFieldsPanel with the post-change draft - AbilityFieldsPanel
  // alone has no way to update `draft`.
  const [draft, setDraft] = useState(new AbilityDraft({name: "Bare Ability", castTime: null, globalCooldown: 1.0, effects: []}));
  return <AbilityFieldsPanel draft={draft} onChange={setDraft} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />;
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
  graphicEffects: [{sourceURL: "../graphics/animations/firebolt.sprites2x2.png", duration: 0.5, when: "immediate", spriteColumns: 2, spriteRows: 2}],
  soundEffects: [{sourceURL: "../audio/firespell1.ogg", duration: 1.8, location: "self", when: "impact", condition: "always"}],
  effects: [{type: "harm", affects: "bTarget", amount: [89.0, 140.0], tags: ["magic", "ranged"]}],
};

const stockAssets = {
  icons: {heal: {url: "/abilities/icons/heal.svg"}},
  graphics: {
    arc: {url: "/abilities/graphics/arc.webp"},
    "magic-ball": {url: "/abilities/graphics/magic-ball.sprites3x3.png", spriteColumns: 3, spriteRows: 3, spriteFrameRate: 12},
  },
  sounds: {twang: {url: "/abilities/sounds/twang.ogg", duration: 0.12}},
};

function renderPanel(data, props = {}) {
  const draft = new AbilityDraft(data);
  const onChange = props.onChange ?? vi.fn();
  render(
    <AbilityFieldsPanel
      draft={draft}
      onChange={onChange}
      assetOverrides={props.assetOverrides ?? {}}
      onUploadAsset={props.onUploadAsset ?? (() => {})}
      onClearAsset={props.onClearAsset ?? (() => {})}
      onRemoveEntry={props.onRemoveEntry ?? (() => {})}
      stockAssets={props.stockAssets}
    />
  );
  return onChange;
}

describe("AbilityFieldsPanel", () => {
  it("renders every recognized field even when the ability lacks it, e.g. cooldown", () => {
    renderPanel(ability);
    expect(screen.getByText("Cooldown")).toBeInTheDocument();
  });

  it("renders name/description/iconURL/castTime/globalCooldown/cooldown/maxRange/speed as editable inputs", () => {
    renderPanel(ability);
    expect(screen.getByDisplayValue("Firebolt")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A bolt of fire.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("../graphics/icons/firebolt.svg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1")).toBeInTheDocument(); // globalCooldown
    expect(screen.getByDisplayValue("60")).toBeInTheDocument(); // speed
    expect(screen.getByDisplayValue("40")).toBeInTheDocument(); // maxRange
  });

  it("calls onChange with an updated name when the name field changes", () => {
    const onChange = renderPanel(ability);
    fireEvent.change(screen.getByDisplayValue("Firebolt"), {target: {value: "Frostbolt"}});
    expect(onChange.mock.calls[0][0].data).toEqual({...ability, name: "Frostbolt"});
  });

  it("calls onChange with an updated string when an editable text field changes", () => {
    const onChange = renderPanel(ability);
    fireEvent.change(screen.getByDisplayValue("../graphics/icons/firebolt.svg"), {target: {value: "../graphics/icons/new.svg"}});
    expect(onChange.mock.calls[0][0].data.iconURL).toBe("../graphics/icons/new.svg");
  });

  it("renders costType/costAmount even when the ability lacks them, both freeform", () => {
    renderPanel(ability);
    expect(screen.getByText("Cost type")).toBeInTheDocument();
    expect(screen.getByText("Cost amount")).toBeInTheDocument();
  });

  it("calls onChange with the cost fields when they're edited", () => {
    const onChange = renderPanel(ability);
    const rows = screen.getAllByRole("row");
    const costTypeInput = rows.find((r) => r.textContent.startsWith("Cost type")).querySelector("input");
    const costAmountInput = rows.find((r) => r.textContent.startsWith("Cost amount")).querySelector("input");

    fireEvent.change(costTypeInput, {target: {value: "energy"}});
    expect(onChange.mock.calls[0][0].data.costType).toBe("energy");

    fireEvent.change(costAmountInput, {target: {value: "20"}});
    expect(onChange.mock.calls[1][0].data.costAmount).toBe(20);
  });

  it("calls onChange with a parsed number when an editable number field changes", () => {
    const onChange = renderPanel(ability);
    fireEvent.change(screen.getByDisplayValue("60"), {target: {value: "75"}});
    expect(onChange.mock.calls[0][0].data.speed).toBe(75);
  });

  it("calls onChange with null when a number field is cleared", () => {
    const onChange = renderPanel(ability);
    fireEvent.change(screen.getByDisplayValue("40"), {target: {value: ""}});
    expect(onChange.mock.calls[0][0].data.maxRange).toBeNull();
  });

  it("renders top-level tags as a comma-joined editable field", () => {
    renderPanel(ability);
    expect(screen.getByDisplayValue("harmful, class_druid")).toBeInTheDocument();
  });

  it("calls onChange with a parsed tag array when the top-level tags field changes", () => {
    const onChange = renderPanel(ability);
    fireEvent.change(screen.getByDisplayValue("harmful, class_druid"), {target: {value: "harmful, class_druid, aoe"}});
    expect(onChange.mock.calls[0][0].data.tags).toEqual(["harmful", "class_druid", "aoe"]);
  });

  it("renders a file upload input for iconURL and calls onUploadAsset with the chosen file", () => {
    const onUploadAsset = vi.fn();
    renderPanel(ability, {onUploadAsset});
    const file = new File(["fake-bytes"], "new-icon.png", {type: "image/png"});
    const fileInput = document.querySelector('input[type="file"]');

    fireEvent.change(fileInput, {target: {files: [file]}});

    expect(onUploadAsset).toHaveBeenCalledWith("iconURL", file);
  });

  it("does not show a Restore button when there is no override for the field", () => {
    renderPanel(ability);
    expect(screen.queryByRole("button", {name: "Restore"})).not.toBeInTheDocument();
  });

  it("shows a Restore button when an override is active and calls onClearAsset when clicked", () => {
    const onClearAsset = vi.fn();
    renderPanel(ability, {assetOverrides: {iconURL: "blob:fake-url"}, onClearAsset});
    fireEvent.click(screen.getByRole("button", {name: "Restore"}));
    expect(onClearAsset).toHaveBeenCalledWith("iconURL");
  });

  describe("stock asset pickers", () => {
    it("lists the recognized stock icons and calls onChange with the colon-wrapped name when one is picked", () => {
      const onChange = renderPanel(ability, {stockAssets});
      const [iconPicker] = screen.getAllByDisplayValue("— stock asset —");

      fireEvent.change(iconPicker, {target: {value: "heal"}});

      expect(onChange.mock.calls[0][0].data.iconURL).toBe(":heal:");
    });

    it("resets to the placeholder after a pick, rather than keeping the picked name selected", () => {
      renderPanel(ability, {stockAssets});
      const [iconPicker] = screen.getAllByDisplayValue("— stock asset —");

      fireEvent.change(iconPicker, {target: {value: "heal"}});

      expect(iconPicker).toHaveValue("");
    });

    it("calls onChange with sourceURL and sprite fields when a stock graphic is picked, clearing fields the new pick doesn't have", () => {
      const onChange = renderPanel(ability, {stockAssets});
      const graphicPicker = screen.getAllByDisplayValue("— stock asset —")[1];

      fireEvent.change(graphicPicker, {target: {value: "arc"}});

      const entry = onChange.mock.calls[0][0].data.graphicEffects[0];
      expect(entry.sourceURL).toBe(":arc:");
      expect(entry.spriteColumns).toBeUndefined();
      expect(entry.spriteRows).toBeUndefined();
    });

    it("carries a stock graphic's sprite grid and frame rate along with sourceURL", () => {
      const onChange = renderPanel(ability, {stockAssets});
      const graphicPicker = screen.getAllByDisplayValue("— stock asset —")[1];

      fireEvent.change(graphicPicker, {target: {value: "magic-ball"}});

      const entry = onChange.mock.calls[0][0].data.graphicEffects[0];
      expect(entry).toMatchObject({sourceURL: ":magic-ball:", spriteColumns: 3, spriteRows: 3, spriteFrameRate: 12});
    });

    it("calls onChange with sourceURL and duration when a stock sound is picked", () => {
      const onChange = renderPanel(ability, {stockAssets});
      const soundPicker = screen.getAllByDisplayValue("— stock asset —")[2];

      fireEvent.change(soundPicker, {target: {value: "twang"}});

      expect(onChange.mock.calls[0][0].data.soundEffects[0]).toMatchObject({sourceURL: ":twang:", duration: 0.12});
    });
  });

  it("renders a heading for each entry, sorted graphic/sound/effect, with no folding", () => {
    renderPanel(ability);
    expect(screen.getByRole("heading", {name: "Graphic effect 1: immediate"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Effect 1: harm"})).toBeInTheDocument();
    expect(document.querySelector("details")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("magic, ranged")).toBeInTheDocument();
  });

  it("always shows all three Add buttons, even for an ability with no effects at all", () => {
    const bare = {name: "Bare Ability", castTime: null, globalCooldown: 1.0};
    renderPanel(bare);
    expect(screen.getByRole("button", {name: "+ Add Graphic effect"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "+ Add Sound effect"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "+ Add Effect"})).toBeInTheDocument();
  });

  describe("entry fields", () => {
    it("renders enum fields (when) as a select with the current value chosen", () => {
      renderPanel(ability);
      expect(screen.getByDisplayValue("immediate").tagName).toEqual("SELECT");
    });

    it("calls onChange when a select (when) changes", () => {
      const onChange = renderPanel(ability);
      fireEvent.change(screen.getByDisplayValue("immediate"), {target: {value: "impact"}});
      expect(onChange.mock.calls[0][0].data.graphicEffects[0].when).toBe("impact");
    });

    it("calls onChange with a collapsed scalar when both range endpoints match", () => {
      const onChange = renderPanel(ability);
      fireEvent.change(screen.getByDisplayValue("140"), {target: {value: "89"}});
      expect(onChange.mock.calls[0][0].data.effects[0].amount).toBe(89);
    });

    it("calls onChange with an array when range endpoints differ", () => {
      const onChange = renderPanel(ability);
      fireEvent.change(screen.getByDisplayValue("89"), {target: {value: "50"}});
      expect(onChange.mock.calls[0][0].data.effects[0].amount).toEqual([50, 140]);
    });

    describe("a bare-scalar 'range' field (zero-based, unlike 'amount')", () => {
      const rangeAbility = {
        ...ability,
        effects: [{type: "harm", affects: "bTarget", amount: 10.0, range: 25.0}],
      };

      it("displays it as 0 to the value, not value to value", () => {
        renderPanel(rangeAbility);
        expect(screen.getByDisplayValue("0")).toBeInTheDocument();
        expect(screen.getByDisplayValue("25")).toBeInTheDocument();
      });

      it("stays a collapsed scalar when the max changes but min is still 0", () => {
        const onChange = renderPanel(rangeAbility);
        fireEvent.change(screen.getByDisplayValue("25"), {target: {value: "40"}});
        expect(onChange.mock.calls[0][0].data.effects[0].range).toBe(40);
      });

      it("becomes an explicit [min, max] array once min is no longer 0", () => {
        const onChange = renderPanel(rangeAbility);
        fireEvent.change(screen.getByDisplayValue("0"), {target: {value: "5"}});
        expect(onChange.mock.calls[0][0].data.effects[0].range).toEqual([5, 25]);
      });
    });

    it("calls onChange with a parsed tag array when tags changes", () => {
      const onChange = renderPanel(ability);
      fireEvent.change(screen.getByDisplayValue("magic, ranged"), {target: {value: "magic, ranged, aoe"}});
      expect(onChange.mock.calls[0][0].data.effects[0].tags).toEqual(["magic", "ranged", "aoe"]);
    });

    it("keeps a trailing comma and space visible while typing a new tag, rather than stripping it immediately", () => {
      const onChange = renderPanel(ability);
      const input = screen.getByDisplayValue("magic, ranged");
      fireEvent.change(input, {target: {value: "magic, ranged, "}});
      expect(input).toHaveValue("magic, ranged, ");
      expect(onChange.mock.calls[0][0].data.effects[0].tags).toEqual(["magic", "ranged"]);
    });

    it("calls onChange when a plain numeric entry field changes", () => {
      const onChange = renderPanel(ability);
      fireEvent.change(screen.getByDisplayValue("0.5"), {target: {value: "0.8"}});
      expect(onChange.mock.calls[0][0].data.graphicEffects[0].duration).toBe(0.8);
    });

    it("renders an image-accepting upload for a graphicEffects sourceURL and calls onUploadAsset with a scoped key", () => {
      const onUploadAsset = vi.fn();
      renderPanel(ability, {onUploadAsset});
      // index 1: index 0 is the top-level iconURL upload, also accept="image/*"
      const fileInput = document.querySelectorAll('input[type="file"][accept="image/*"]')[1];
      const file = new File(["fake-bytes"], "new-effect.png", {type: "image/png"});

      fireEvent.change(fileInput, {target: {files: [file]}});

      expect(onUploadAsset).toHaveBeenCalledWith("graphicEffects[0].sourceURL", file);
    });

    it("renders an audio-accepting upload for a soundEffects sourceURL", () => {
      const abilityWithSound = {...ability, soundEffects: [{sourceURL: "../audio/firespell1.ogg", duration: 1.8, when: "immediate"}]};
      const onUploadAsset = vi.fn();
      renderPanel(abilityWithSound, {onUploadAsset});
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
      renderPanel(twoEffects, {assetOverrides: {"graphicEffects[1].sourceURL": "blob:local-b"}, onClearAsset});

      expect(screen.getAllByRole("button", {name: "Restore"})).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", {name: "Restore"}));
      expect(onClearAsset).toHaveBeenCalledWith("graphicEffects[1].sourceURL");
    });

    it("shows spriteColumns/spriteRows as editable fields even on a graphicEffect that never had them", () => {
      // e.g. the ability's original effect was a plain image, and the user
      // uploaded an animated sprite sheet to replace it - there needs to be
      // somewhere to declare the new grid dimensions.
      const plainImageAbility = {...ability, graphicEffects: [{sourceURL: "punch-impact.webp", duration: 0.3}]};
      renderPanel(plainImageAbility);

      expect(screen.getByText("Sprite columns")).toBeInTheDocument();
      expect(screen.getByText("Sprite rows")).toBeInTheDocument();
      expect(screen.getByText("Sprite frame rate")).toBeInTheDocument();
    });

    it("calls onChange when a previously-unset spriteColumns field is filled in", () => {
      const plainImageAbility = {...ability, graphicEffects: [{sourceURL: "punch-impact.webp", duration: 0.3}]};
      const onChange = renderPanel(plainImageAbility);

      const row = screen.getByText("Sprite columns").closest("tr");
      const input = row.querySelector("input");
      fireEvent.change(input, {target: {value: "3"}});

      expect(onChange.mock.calls[0][0].data.graphicEffects[0].spriteColumns).toBe(3);
    });

    it("renders the nested status object as an editable name field, not read-only text", () => {
      const withStatus = {
        ...ability,
        effects: [{type: "status", affects: "self", duration: 5.0, status: {name: "Focused", shortName: "Focus", treatAs: "buff", stacking: "replace", effects: []}}],
      };
      renderPanel(withStatus);
      expect(screen.getByDisplayValue("Focused")).toBeInTheDocument();
      expect(screen.queryByText("Name: Focused; Treat as: buff")).not.toBeInTheDocument();
    });

    it("calls onChange with a merged status object when a nested status field changes", () => {
      const withStatus = {
        ...ability,
        effects: [{type: "status", affects: "self", duration: 5.0, status: {name: "Focused", shortName: "Focus", treatAs: "buff", stacking: "replace", effects: []}}],
      };
      const onChange = renderPanel(withStatus);

      fireEvent.change(screen.getByDisplayValue("Focused"), {target: {value: "Focused II"}});

      expect(onChange.mock.calls[0][0].data.effects[0].status).toEqual({
        name: "Focused II", shortName: "Focus", treatAs: "buff", stacking: "replace", effects: [],
      });
    });
  });

  describe("adding and removing entries", () => {
    it("calls onChange with a placeholder graphicEffects entry when Add Graphic effect is clicked", () => {
      const bare = {name: "Bare Ability", castTime: null, globalCooldown: 1.0};
      const onChange = renderPanel(bare);

      fireEvent.click(screen.getByRole("button", {name: "+ Add Graphic effect"}));

      expect(onChange.mock.calls[0][0].data.graphicEffects).toEqual([
        {sourceURL: "", duration: 0.3, from: "self", when: "immediate", condition: "always"},
      ]);
    });

    it("calls onChange with a placeholder harm effect when Add Effect is clicked", () => {
      const onChange = renderPanel(ability);

      fireEvent.click(screen.getByRole("button", {name: "+ Add Effect"}));

      expect(onChange.mock.calls[0][0].data.effects.at(-1)).toEqual({type: "harm", affects: "bTarget", amount: 10.0, range: 5.0});
    });

    it("renders a newly-added entry's fields immediately, with no expand step needed", () => {
      const bare = {name: "Bare Ability", castTime: null, globalCooldown: 1.0};
      const onChange = vi.fn();
      const {rerender} = render(
        <AbilityFieldsPanel draft={new AbilityDraft(bare)} onChange={onChange} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />
      );

      fireEvent.click(screen.getByRole("button", {name: "+ Add Effect"}));
      const nextDraft = onChange.mock.calls[0][0];
      rerender(
        <AbilityFieldsPanel draft={nextDraft} onChange={onChange} assetOverrides={{}} onUploadAsset={() => {}} onClearAsset={() => {}} onRemoveEntry={() => {}} />
      );

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
      renderPanel(ability, {onRemoveEntry});

      fireEvent.click(screen.getAllByRole("button", {name: "Remove"})[0]);

      expect(onRemoveEntry).toHaveBeenCalledWith("graphicEffects", 0);
    });
  });
});
