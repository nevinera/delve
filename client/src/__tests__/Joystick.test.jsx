import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { Joystick } from "../Joystick";

// Mocks nipplejs's manager: captures registered handlers by event name and
// calls them the way the real library does - a SINGLE `evt` argument shaped
// {type, data}, not the classic two-arg (evt, data) most nipplejs docs show.
// This is the exact contract a prior bug got wrong (data was read from a
// nonexistent second argument, so it was always undefined and every move
// silently threw) - these tests pin that contract down.
let handlers;
let destroyMock;
let createMock;

vi.mock("nipplejs", () => ({
  default: {
    create: (...args) => createMock(...args),
  },
}));

beforeEach(() => {
  handlers = {};
  destroyMock = vi.fn();
  createMock = vi.fn(() => ({
    on: (event, cb) => { handlers[event] = cb; },
    destroy: destroyMock,
  }));
});

function fire(event, data) {
  handlers[event]({ type: event, data });
}

describe("Joystick", () => {
  it("creates the nipplejs manager against its own zone element", () => {
    const movementKeysRef = { current: new Set() };
    render(<Joystick movementKeysRef={movementKeysRef} onChange={() => {}} style={{}} />);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].zone).toBeInstanceOf(HTMLElement);
  });

  it("sets movementKeysRef from the move angle and calls onChange", () => {
    const movementKeysRef = { current: new Set() };
    const onChange = vi.fn();
    render(<Joystick movementKeysRef={movementKeysRef} onChange={onChange} style={{}} />);

    fire("move", { angle: { degree: 90 }, force: 0.5 });

    expect([...movementKeysRef.current]).toEqual(["forward"]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("maps a diagonal angle to both movement keys", () => {
    const movementKeysRef = { current: new Set() };
    render(<Joystick movementKeysRef={movementKeysRef} onChange={() => {}} style={{}} />);

    fire("move", { angle: { degree: 45 }, force: 0.8 });

    expect([...movementKeysRef.current].sort()).toEqual(["forward", "strafe_right"]);
  });

  it("clears movement keys when force is below the deadzone", () => {
    const movementKeysRef = { current: new Set(["forward"]) };
    const onChange = vi.fn();
    render(<Joystick movementKeysRef={movementKeysRef} onChange={onChange} style={{}} />);

    fire("move", { angle: { degree: 90 }, force: 0.05 });

    expect(movementKeysRef.current.size).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("clears movement keys on end", () => {
    const movementKeysRef = { current: new Set(["forward", "strafe_right"]) };
    const onChange = vi.fn();
    render(<Joystick movementKeysRef={movementKeysRef} onChange={onChange} style={{}} />);

    fire("end", undefined);

    expect(movementKeysRef.current.size).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("destroys the nipplejs manager on unmount", () => {
    const movementKeysRef = { current: new Set() };
    const { unmount } = render(<Joystick movementKeysRef={movementKeysRef} onChange={() => {}} style={{}} />);

    unmount();

    expect(destroyMock).toHaveBeenCalledTimes(1);
  });
});
