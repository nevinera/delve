import {describe, it, expect, vi, afterEach} from "vitest";
import {render, screen, act} from "@testing-library/react";
import ExpiryBanner from "../ExpiryBanner";

describe("ExpiryBanner", () => {
  afterEach(() => vi.useRealTimers());

  it("shows nothing without an expiry, or while it's more than ten minutes out", () => {
    const {container, rerender} = render(<ExpiryBanner expiresAt={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ExpiryBanner expiresAt={Date.now() + 60 * 60_000} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts down each second in the last ten minutes", () => {
    vi.useFakeTimers();
    const now = new Date("2030-01-01T00:00:00Z").getTime();
    vi.setSystemTime(now);
    render(<ExpiryBanner expiresAt={now + 65_000} />);
    expect(screen.getByRole("status")).toHaveTextContent("expires in 1:05");

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("status")).toHaveTextContent("expires in 1:04");
  });
});
