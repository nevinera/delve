import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {WorkerSocket, createGameSocket} from "../workerSocket";

class FakeWorker {
  constructor() {
    this.posted = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  postMessage(msg) {
    this.posted.push(msg);
  }

  terminate() {
    this.terminated = true;
  }
}
FakeWorker.instances = [];

describe("WorkerSocket", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("asks the worker to connect, and relays open/message/close", () => {
    const socket = new WorkerSocket("wss://game.example.com/x");
    const worker = FakeWorker.instances[0];
    const events = [];
    socket.onopen = () => events.push("open");
    socket.onmessage = (e) => events.push(`message:${e.data}`);
    socket.onclose = () => events.push("close");

    expect(worker.posted).toEqual([{type: "connect", url: "wss://game.example.com/x"}]);
    expect(socket.readyState).toBe(WebSocket.CONNECTING);

    worker.onmessage({data: {type: "open"}});
    expect(socket.readyState).toBe(WebSocket.OPEN);
    worker.onmessage({data: {type: "message", data: "hi"}});
    worker.onmessage({data: {type: "close"}});

    expect(events).toEqual(["open", "message:hi", "close"]);
    expect(socket.readyState).toBe(WebSocket.CLOSED);
    expect(worker.terminated).toBe(true);
  });

  it("forwards send and close to the worker", () => {
    const socket = new WorkerSocket("wss://game.example.com/x");
    const worker = FakeWorker.instances[0];

    socket.send('{"a":1}');
    socket.close();

    expect(worker.posted.slice(1)).toEqual([{type: "send", data: '{"a":1}'}, {type: "close"}]);
  });

  it("falls back to a plain WebSocket when Workers are unavailable", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("Worker", undefined);
    const ctor = vi.fn();
    vi.stubGlobal("WebSocket", ctor);

    createGameSocket("wss://game.example.com/x");

    expect(ctor).toHaveBeenCalledWith("wss://game.example.com/x");
  });
});
