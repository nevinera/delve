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
    render(<Joystick onMove={() => {}} onEnd={() => {}} style={{}} />);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].zone).toBeInstanceOf(HTMLElement);
  });

  it("calls onMove with the raw move data once past the deadzone", () => {
    const onMove = vi.fn();
    render(<Joystick onMove={onMove} onEnd={() => {}} style={{}} />);

    const data = { angle: { degree: 90 }, force: 0.5, vector: { x: 0, y: 1 } };
    fire("move", data);

    expect(onMove).toHaveBeenCalledWith(data);
  });

  it("calls onEnd instead of onMove when force is below the deadzone", () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    render(<Joystick onMove={onMove} onEnd={onEnd} style={{}} />);

    fire("move", { angle: { degree: 90 }, force: 0.05, vector: { x: 0, y: 0.05 } });

    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("calls onEnd on end", () => {
    const onEnd = vi.fn();
    render(<Joystick onMove={() => {}} onEnd={onEnd} style={{}} />);

    fire("end", undefined);

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("destroys the nipplejs manager on unmount", () => {
    const { unmount } = render(<Joystick onMove={() => {}} onEnd={() => {}} style={{}} />);

    unmount();

    expect(destroyMock).toHaveBeenCalledTimes(1);
  });
});
