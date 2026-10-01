import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";

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

  close() {
    this.onclose?.();
  }
}
FakeWebSocket.OPEN = 1;
FakeWebSocket.instances = [];

describe("socketWorker keepalive", () => {
  let posted;
  let send;

  beforeEach(async () => {
    FakeWebSocket.instances = [];
    posted = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("self", {postMessage: (m) => posted.push(m)});
    vi.resetModules();
    await import("../socketWorker");
    send = (msg) => globalThis.self.onmessage({data: msg});
    send({type: "connect", url: "wss://x"});
    FakeWebSocket.instances[0].onopen();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports open, then sends a keepalive when nothing else was sent", () => {
    expect(posted).toContainEqual({type: "open"});
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances[0].sent).toContainEqual({direction: "up", type: "keepalive"});
  });

  it("stays quiet while the main thread keeps sending", () => {
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(250);
      send({type: "send", data: '{"type":"heartbeat"}'});
    }
    expect(FakeWebSocket.instances[0].sent.filter((m) => m.type === "keepalive")).toEqual([]);
  });

  it("stops keepalives once the socket closes", () => {
    FakeWebSocket.instances[0].onclose();
    const before = FakeWebSocket.instances[0].sent.length;
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances[0].sent.length).toBe(before);
    expect(posted).toContainEqual({type: "close"});
  });
});
