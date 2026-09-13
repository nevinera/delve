import {describe, it, expect, vi, beforeEach} from "vitest";
import {validateAbility, validateCharacterClass, validateUnitType} from "../validateContent";

describe("validateAbility", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="csrf-token" content="fake-token">';
    global.fetch = vi.fn();
  });

  it("posts the ability to Build::ValidatorsController#ability with the CSRF token", async () => {
    global.fetch.mockResolvedValue({json: () => Promise.resolve({valid: true})});
    const ability = {name: "Punch"};

    const result = await validateAbility(ability);

    expect(global.fetch).toHaveBeenCalledWith("/build/validators/ability", {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-CSRF-Token": "fake-token"},
      body: JSON.stringify(ability),
    });
    expect(result).toEqual({valid: true});
  });

  it("resolves the error payload for an invalid ability without throwing", async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({valid: false, error: {message: "name is required (at $.name)", path: "$.name"}}),
    });

    const result = await validateAbility({});

    expect(result).toEqual({valid: false, error: {message: "name is required (at $.name)", path: "$.name"}});
  });
});

describe("validateCharacterClass", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="csrf-token" content="fake-token">';
    global.fetch = vi.fn();
  });

  it("posts the resolved class to Build::ValidatorsController#character_class", async () => {
    global.fetch.mockResolvedValue({json: () => Promise.resolve({valid: true})});
    const fullClass = {name: "Puncher", powers: [{name: "Punch"}]};

    const result = await validateCharacterClass(fullClass);

    expect(global.fetch).toHaveBeenCalledWith("/build/validators/character_class", {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-CSRF-Token": "fake-token"},
      body: JSON.stringify(fullClass),
    });
    expect(result).toEqual({valid: true});
  });
});

describe("validateUnitType", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="csrf-token" content="fake-token">';
    global.fetch = vi.fn();
  });

  it("posts the resolved unit type to Build::ValidatorsController#unit_type", async () => {
    global.fetch.mockResolvedValue({json: () => Promise.resolve({valid: true})});
    const fullUnitType = {name: "Goblin Raider", powers: [{name: "Slash"}]};

    const result = await validateUnitType(fullUnitType);

    expect(global.fetch).toHaveBeenCalledWith("/build/validators/unit_type", {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-CSRF-Token": "fake-token"},
      body: JSON.stringify(fullUnitType),
    });
    expect(result).toEqual({valid: true});
  });
});
