import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {GameConnection} from "../connection";

// Real crypto.subtle.digest has enough wall-clock jitter under system load to
// make timer-based assertions about delay ordering flaky - stub it so the
// only thing under test is connection.js's own setTimeout-based delay.
vi.mock("../checksum", () => ({computeChecksum: vi.fn().mockResolvedValue("ignored")}));

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
function connectAndOpen(options = {}) {
  const conn = new GameConnection({
    gameServerUrl: "https://game.example.com",
    instanceId: "instance-1",
    slotId: "slot-1",
    slotToken: "tok",
    ...options,
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

describe("GameConnection simulated latency/jitter", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends immediately when no latency is configured", () => {
    const {conn, ws} = connectAndOpen();

    conn.send({type: "move"});

    expect(ws.sent.some((m) => m.type === "move")).toBe(true);
  });

  it("delays an outgoing send by simulatedLatencyMs", () => {
    const {conn, ws} = connectAndOpen({simulatedLatencyMs: 100});

    conn.send({type: "move"});
    expect(ws.sent).toHaveLength(0);

    vi.advanceTimersByTime(99);
    expect(ws.sent).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(ws.sent).toHaveLength(1);
  });

  it("delays processing of an incoming message by simulatedLatencyMs", async () => {
    const onStateChange = vi.fn();
    const {ws} = connectAndOpen({simulatedLatencyMs: 100, onStateChange});

    ws.onmessage({data: JSON.stringify({direction: "down", type: "instance-state", units: {}, checksum: "ignored"})});
    expect(onStateChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(onStateChange).toHaveBeenCalled();
  });

  it("applies jitter within [-jitter, +jitter] of the base latency", () => {
    const randomSpy = vi.spyOn(Math, "random");

    randomSpy.mockReturnValue(0); // -jitter -> 100 - 50 = 50ms
    const {conn: connMin, ws: wsMin} = connectAndOpen({simulatedLatencyMs: 100, simulatedJitterMs: 50});
    connMin.send({type: "move"});
    vi.advanceTimersByTime(49);
    expect(wsMin.sent).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(wsMin.sent).toHaveLength(1);

    randomSpy.mockReturnValue(1); // +jitter -> 100 + 50 = 150ms
    const {conn: connMax, ws: wsMax} = connectAndOpen({simulatedLatencyMs: 100, simulatedJitterMs: 50});
    connMax.send({type: "move"});
    vi.advanceTimersByTime(149);
    expect(wsMax.sent).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(wsMax.sent).toHaveLength(1);

    randomSpy.mockRestore();
  });

  it("never applies a negative delay even with jitter larger than the base latency", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0); // -jitter
    const {conn, ws} = connectAndOpen({simulatedLatencyMs: 10, simulatedJitterMs: 100});

    conn.send({type: "move"});
    vi.advanceTimersByTime(0);

    expect(ws.sent).toHaveLength(1); // clamped to 0ms, not -90ms

    randomSpy.mockRestore();
  });
});
