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

describe("GameConnection seq stamping", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends heartbeats with an incrementing hex seq", () => {
    const {ws} = connectAndOpen();

    vi.advanceTimersByTime(300);
    vi.advanceTimersByTime(300);

    const seqs = ws.sent.filter((m) => m.type === "heartbeat").map((m) => m.seq);
    expect(seqs).toEqual(["1", "2"]);
  });

  it("stamps every outgoing message with a seq, not just heartbeat/move", () => {
    const {conn, ws} = connectAndOpen();

    conn.send({type: "target", target_id: "abc"});

    const msg = ws.sent.find((m) => m.type === "target");
    expect(msg.seq).toMatch(/^[0-9a-f]+$/);
  });

  it("overwrites any seq the caller already set, so it can't collide with the connection's own counter", () => {
    const {conn, ws} = connectAndOpen();

    conn.send({type: "target", seq: "not-a-real-seq"});

    expect(ws.sent[0].seq).not.toBe("not-a-real-seq");
  });

  it("computes the round-trip time for a seq it sent", () => {
    const {conn} = connectAndOpen();

    vi.advanceTimersByTime(300); // sends seq "1" (a heartbeat)
    vi.advanceTimersByTime(150); // 150ms pass before the server's echo is processed

    expect(conn.rttForSeq("1")).toBe(150);
  });

  it("returns null for a seq that was never sent", () => {
    const {conn} = connectAndOpen();
    vi.advanceTimersByTime(300);

    expect(conn.rttForSeq("does-not-exist")).toBeNull();
  });

  it("forgets a seq once it's older than the retention window", () => {
    const {conn} = connectAndOpen();

    vi.advanceTimersByTime(300); // sends seq "1"
    // Well past the 10s retention window - a later heartbeat send (every
    // 300ms) is what actually triggers the prune, so advance past the next
    // one due after the window closes, not just past the window itself.
    vi.advanceTimersByTime(10500);

    expect(conn.rttForSeq("1")).toBeNull();
  });

  it("keeps a seq within the retention window", () => {
    const {conn} = connectAndOpen();

    vi.advanceTimersByTime(300); // sends seq "1"
    vi.advanceTimersByTime(9000); // still within the 10s retention window

    expect(conn.rttForSeq("1")).not.toBeNull();
  });

  it("records the position for a move that included x/y, retrievable by its seq", () => {
    const {conn, ws} = connectAndOpen();

    conn.send({type: "move", x: 5, y: 7});
    const seq = ws.sent.find((m) => m.type === "move").seq;

    expect(conn.positionForSeq(seq)).toMatchObject({x: 5, y: 7});
  });

  it("returns null for a move's seq when it had no x/y", () => {
    const {conn, ws} = connectAndOpen();

    conn.send({type: "move", keys: ["forward"]});
    const seq = ws.sent.find((m) => m.type === "move").seq;

    expect(conn.positionForSeq(seq)).toBeNull();
  });

  it("prunes a position seq once a later move send finds it past the retention window", () => {
    // _sentPositions is only pruned on a move send (not every heartbeat,
    // unlike _sentAt) - so an old entry needs a fresh move to trigger its
    // own cleanup, not just the passage of time.
    const {conn, ws} = connectAndOpen();

    conn.send({type: "move", x: 1, y: 1});
    const firstSeq = ws.sent.find((m) => m.type === "move").seq;

    vi.advanceTimersByTime(10300);
    conn.send({type: "move", x: 2, y: 2});

    expect(conn.positionForSeq(firstSeq)).toBeNull();
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

  it("delivers sends in order even when a later message rolls a shorter delay", () => {
    const randomSpy = vi.spyOn(Math, "random");
    const {conn, ws} = connectAndOpen({simulatedLatencyMs: 100, simulatedJitterMs: 50});

    randomSpy.mockReturnValueOnce(1); // message 1: +jitter -> 150ms
    conn.send({type: "move", label: 1});
    randomSpy.mockReturnValueOnce(0); // message 2: -jitter -> 50ms, rolled shorter than message 1
    conn.send({type: "move", label: 2});

    vi.advanceTimersByTime(150);
    expect(ws.sent.map((m) => m.label)).toEqual([1]); // not yet reordered ahead of message 1

    vi.advanceTimersByTime(1);
    expect(ws.sent.map((m) => m.label)).toEqual([1, 2]);

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
