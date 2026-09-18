import {describe, it, expect} from "vitest";
import {AbilityDraft} from "../AbilityDraft";
import {StatusDraft} from "../StatusDraft";

const base = {name: "Firebolt", castTime: null, globalCooldown: 1.0, graphicEffects: [], soundEffects: [], effects: []};

describe("AbilityDraft", () => {
  describe("setField", () => {
    it("returns a new AbilityDraft with the field updated, leaving the rest untouched", () => {
      const draft = new AbilityDraft(base);

      const result = draft.setField("name", "Frostbolt");

      expect(result).not.toBe(draft);
      expect(result.data).toEqual({...base, name: "Frostbolt"});
      expect(draft.data.name).toBe("Firebolt");
    });
  });

  describe("addEntry", () => {
    it("appends a placeholder entry for the given section", () => {
      const result = new AbilityDraft(base).addEntry("graphicEffects");

      expect(result.data.graphicEffects).toHaveLength(1);
      expect(result.data.graphicEffects[0]).toMatchObject({sourceURL: "", when: "immediate"});
    });

    it("creates the section array when it doesn't exist yet", () => {
      const result = new AbilityDraft({name: "Firebolt"}).addEntry("effects");

      expect(result.data.effects).toHaveLength(1);
    });

    it("doesn't mutate the original draft's array", () => {
      const draft = new AbilityDraft(base);
      draft.addEntry("graphicEffects");

      expect(draft.data.graphicEffects).toHaveLength(0);
    });
  });

  describe("removeEntry", () => {
    it("removes only the entry at the given index", () => {
      const draft = new AbilityDraft({...base, effects: [{type: "harm"}, {type: "heal"}, {type: "resource"}]});

      const result = draft.removeEntry("effects", 1);

      expect(result.data.effects).toEqual([{type: "harm"}, {type: "resource"}]);
    });
  });

  describe("updateEntryField", () => {
    it("updates the named field on the entry at the given index only", () => {
      const draft = new AbilityDraft({
        ...base,
        graphicEffects: [{sourceURL: "a.png", when: "immediate"}, {sourceURL: "b.png", when: "impact"}],
      });

      const result = draft.updateEntryField("graphicEffects", 1, "when", "always");

      expect(result.data.graphicEffects[0]).toEqual({sourceURL: "a.png", when: "immediate"});
      expect(result.data.graphicEffects[1]).toEqual({sourceURL: "b.png", when: "always"});
    });
  });

  describe("updateEntryFields", () => {
    it("merges every given field onto the entry at the given index only", () => {
      const draft = new AbilityDraft({
        ...base,
        graphicEffects: [{sourceURL: "a.png", spriteColumns: 2, spriteRows: 2}, {sourceURL: "b.png"}],
      });

      const result = draft.updateEntryFields("graphicEffects", 0, {sourceURL: ":arc:", spriteColumns: undefined, spriteRows: undefined});

      expect(result.data.graphicEffects[0]).toEqual({sourceURL: ":arc:", spriteColumns: undefined, spriteRows: undefined});
      expect(result.data.graphicEffects[1]).toEqual({sourceURL: "b.png"});
    });
  });

  describe("pickStockAsset", () => {
    it("writes sourceURL and sprite fields for a graphicEffects pick", () => {
      const draft = new AbilityDraft({...base, graphicEffects: [{sourceURL: "old.png", spriteColumns: 4}]});
      const stockOptions = {arc: {spriteColumns: null, spriteRows: null, spriteFrameCount: null, spriteFrameRate: null}};

      const result = draft.pickStockAsset("graphicEffects", 0, "arc", stockOptions);

      expect(result.data.graphicEffects[0].sourceURL).toBe(":arc:");
      expect(result.data.graphicEffects[0].spriteColumns).toBeNull();
    });

    it("writes sourceURL and duration for a soundEffects pick", () => {
      const draft = new AbilityDraft({...base, soundEffects: [{sourceURL: "old.ogg"}]});
      const stockOptions = {twang: {duration: 0.5}};

      const result = draft.pickStockAsset("soundEffects", 0, "twang", stockOptions);

      expect(result.data.soundEffects[0]).toEqual({sourceURL: ":twang:", duration: 0.5});
    });
  });

  describe("pickStockIcon", () => {
    it("sets iconURL to the stock-reference form", () => {
      const result = new AbilityDraft(base).pickStockIcon("heal");

      expect(result.data.iconURL).toBe(":heal:");
    });
  });

  describe("statusFor/setStatus/addStatus/removeStatus", () => {
    it("statusFor returns null when the entry has no status", () => {
      const draft = new AbilityDraft({...base, effects: [{type: "harm"}]});

      expect(draft.statusFor(0)).toBeNull();
    });

    it("statusFor returns a StatusDraft wrapping the entry's status", () => {
      const status = {name: "Focused", shortName: "Focus", treatAs: "buff", stacking: "replace", effects: []};
      const draft = new AbilityDraft({...base, effects: [{type: "status", status}]});

      expect(draft.statusFor(0)).toBeInstanceOf(StatusDraft);
      expect(draft.statusFor(0).data).toEqual(status);
    });

    it("setStatus writes the given StatusDraft's data back onto the entry", () => {
      const status = {name: "Focused", shortName: "Focus", treatAs: "buff", stacking: "replace", effects: []};
      const draft = new AbilityDraft({...base, effects: [{type: "status", status}]});

      const result = draft.setStatus(0, new StatusDraft({...status, name: "Focused II"}));

      expect(result.data.effects[0].status.name).toBe("Focused II");
    });

    it("setStatus(index, null) clears the entry's status", () => {
      const status = {name: "Focused", shortName: "Focus", treatAs: "buff", stacking: "replace", effects: []};
      const draft = new AbilityDraft({...base, effects: [{type: "status", status}]});

      const result = draft.setStatus(0, null);

      expect(result.data.effects[0].status).toBeNull();
    });

    it("addStatus sets a fresh blank status on the entry", () => {
      const draft = new AbilityDraft({...base, effects: [{type: "status"}]});

      const result = draft.addStatus(0);

      expect(result.data.effects[0].status).toEqual({name: "", shortName: "", treatAs: "buff", stacking: "replace", effects: []});
    });

    it("removeStatus clears the entry's status", () => {
      const status = {name: "Focused", shortName: "Focus", treatAs: "buff", stacking: "replace", effects: []};
      const draft = new AbilityDraft({...base, effects: [{type: "status", status}]});

      const result = draft.removeStatus(0);

      expect(result.data.effects[0].status).toBeNull();
    });
  });
});
