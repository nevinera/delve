import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {GameConnection} from "../connection";

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {}
}
FakeWebSocket.OPEN = 1;
FakeWebSocket.instances = [];

// onopen is assigned by GameConnection right after construction, so we open
// it explicitly here rather than firing it from the constructor - mirrors
// the real order of operations without racing fake timers/microtasks.
function connectAndOpen() {
  const conn = new GameConnection({
    gameServerUrl: "https://game.example.com",
    instanceId: "instance-1",
    slotId: "slot-1",
    slotToken: "tok",
  });
  conn.connect();
  const ws = FakeWebSocket.instances.at(-1);
  ws.onopen();
  return {conn, ws};
}

describe("GameConnection heartbeats", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends heartbeats with an incrementing beat_id", () => {
    const {ws} = connectAndOpen();

    vi.advanceTimersByTime(300);
    vi.advanceTimersByTime(300);

    const beatIds = ws.sent.filter((m) => m.type === "heartbeat").map((m) => m.beat_id);
    expect(beatIds).toEqual([1, 2]);
  });

  it("computes the round-trip time for a beat_id it sent", () => {
    const {conn} = connectAndOpen();

    vi.advanceTimersByTime(300); // sends beat_id 1
    vi.advanceTimersByTime(150); // 150ms pass before the server's echo is processed

    expect(conn.rttForBeat(1)).toBe(150);
  });

  it("returns null for a beat_id that was never sent", () => {
    const {conn} = connectAndOpen();
    vi.advanceTimersByTime(300);

    expect(conn.rttForBeat(999)).toBeNull();
  });

  it("forgets beat ids once more than 20 newer ones have been sent", () => {
    const {conn} = connectAndOpen();

    vi.advanceTimersByTime(300 * 21); // sends beat_id 1..21

    expect(conn.rttForBeat(1)).toBeNull();
    expect(conn.rttForBeat(21)).not.toBeNull();
  });
});
