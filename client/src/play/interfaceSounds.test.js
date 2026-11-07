import { describe, expect, it } from "vitest";
import { INTERFACE_VOLUME, InterfaceSounds } from "./interfaceSounds.js";

function sounds() {
  const played = [];
  let later = [];
  const made = new InterfaceSounds(null, { play: (name, volume) => played.push([name, volume]), defer: (fn) => later.push(fn) });
  const flush = () => {
    const now = later;
    later = [];
    now.forEach((fn) => fn());
  };
  return { made, played, flush };
}

describe("InterfaceSounds", () => {
  it("clicks quietly", () => {
    const { made, played, flush } = sounds();
    made.click();
    flush();
    expect(played).toEqual([["ui-click", INTERFACE_VOLUME["ui-click"]]]);
  });

  it("plays only the page turning when a click opens a window", () => {
    const { made, played, flush } = sounds();
    made.click();
    made.closed();
    made.opened();
    made.click();
    flush();
    expect(played.map(([name]) => name)).toEqual(["ui-open"]);
  });

  it("shuts the book over a click", () => {
    const { made, played, flush } = sounds();
    made.click();
    made.closed();
    flush();
    expect(played.map(([name]) => name)).toEqual(["ui-close"]);
  });

  it("plays each press on its own", () => {
    const { made, played, flush } = sounds();
    made.click();
    flush();
    made.click();
    flush();
    expect(played).toHaveLength(2);
  });

  it("says no straight away", () => {
    const { made, played } = sounds();
    made.error();
    expect(played).toEqual([["ui-error", INTERFACE_VOLUME["ui-error"]]]);
  });
});
