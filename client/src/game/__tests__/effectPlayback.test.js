import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {playSoundEffects, firePowerEffects} from "../effectPlayback";

const stockAssets = {sounds: {twang: {url: "/abilities/sounds/twang.ogg"}}};

describe("playSoundEffects", () => {
  let playedUrls;

  beforeEach(() => {
    playedUrls = [];
    global.Audio = vi.fn().mockImplementation((url) => {
      playedUrls.push(url);
      return {play: () => Promise.resolve()};
    });
  });

  afterEach(() => {
    delete global.Audio;
  });

  it("resolves a stock sourceURL against this app's own origin, not baseUrl", () => {
    playSoundEffects([{sourceURL: ":twang:", volumeScale: 1}], "https://raw.githubusercontent.com/user/repo/main/abilities/x.json", stockAssets);
    expect(playedUrls).toEqual([`${window.location.origin}/abilities/sounds/twang.ogg`]);
  });

  it("resolves a normal relative sourceURL against baseUrl when it isn't a stock reference", () => {
    playSoundEffects([{sourceURL: "../audio/x.ogg", volumeScale: 1}], "https://example.com/content/abilities/a.json", stockAssets);
    expect(playedUrls).toEqual(["https://example.com/content/audio/x.ogg"]);
  });
});

describe("firePowerEffects", () => {
  beforeEach(() => {
    global.Audio = vi.fn().mockImplementation(() => ({play: () => Promise.resolve()}));
  });

  afterEach(() => {
    delete global.Audio;
  });

  it("passes stockAssets through to the sceneManager for immediate graphic effects", () => {
    const sceneManager = {playGraphicEffects: vi.fn()};
    const power = {graphicEffects: [{sourceURL: ":arc:", when: "immediate"}]};

    firePowerEffects(power, {positions: {self: {x: 0, y: 0}, target: {x: 1, y: 0}}, baseUrl: "https://example.com/", sceneManager, stockAssets});

    expect(sceneManager.playGraphicEffects).toHaveBeenCalledWith(
      power.graphicEffects, expect.anything(), "https://example.com/", 0, stockAssets
    );
  });

  describe("status effect auras", () => {
    it("calls playAuraEffect for a status effect that has an auraEffect", () => {
      const sceneManager = {playAuraEffect: vi.fn()};
      const auraEffect = {sourceURL: "../graphics/effects/glow.webp"};
      const power = {effects: [{type: "status", affects: "self", duration: 8.0, status: {name: "Second Wind", auraEffect}}]};

      firePowerEffects(power, {positions: {self: {x: 0, y: 0}, target: {x: 1, y: 0}}, baseUrl: "https://example.com/", sceneManager, stockAssets});

      expect(sceneManager.playAuraEffect).toHaveBeenCalledWith(auraEffect, "self", 8.0, "https://example.com/", stockAssets);
    });

    it("targets the affected token for a non-self status effect", () => {
      const sceneManager = {playAuraEffect: vi.fn()};
      const auraEffect = {sourceURL: "../graphics/effects/glow.webp"};
      const power = {effects: [{type: "status", affects: "bTarget", duration: 8.0, status: {name: "Weakened", auraEffect}}]};

      firePowerEffects(power, {positions: {self: {x: 0, y: 0}, target: {x: 1, y: 0}}, baseUrl: "https://example.com/", sceneManager, stockAssets});

      expect(sceneManager.playAuraEffect).toHaveBeenCalledWith(auraEffect, "affected", 8.0, "https://example.com/", stockAssets);
    });

    it("doesn't call playAuraEffect for a status effect with no auraEffect", () => {
      const sceneManager = {playAuraEffect: vi.fn()};
      const power = {effects: [{type: "status", affects: "self", duration: 8.0, status: {name: "Winded"}}]};

      firePowerEffects(power, {positions: {self: {x: 0, y: 0}, target: {x: 1, y: 0}}, baseUrl: "https://example.com/", sceneManager, stockAssets});

      expect(sceneManager.playAuraEffect).not.toHaveBeenCalled();
    });

    it("doesn't throw when the sceneManager doesn't implement playAuraEffect", () => {
      const sceneManager = {playGraphicEffects: vi.fn()};
      const power = {effects: [{type: "status", affects: "self", duration: 8.0, status: {name: "Second Wind", auraEffect: {sourceURL: "x.webp"}}}]};

      expect(() =>
        firePowerEffects(power, {positions: {self: {x: 0, y: 0}, target: {x: 1, y: 0}}, baseUrl: "https://example.com/", sceneManager, stockAssets})
      ).not.toThrow();
    });
  });
});
