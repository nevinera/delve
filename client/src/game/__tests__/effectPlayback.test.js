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
});
