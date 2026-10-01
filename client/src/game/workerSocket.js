// A WebSocket look-alike (the subset GameConnection uses) whose real socket
// lives in socketWorker.js - see there for why.
export class WorkerSocket {
  constructor(url) {
    this.readyState = WorkerSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this._worker = new Worker(new URL("./socketWorker.js", import.meta.url), { type: "module" });
    this._worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "open") {
        this.readyState = WorkerSocket.OPEN;
        this.onopen?.();
      } else if (msg.type === "message") {
        this.onmessage?.({ data: msg.data });
      } else if (msg.type === "error") {
        this.onerror?.(msg);
      } else if (msg.type === "close") {
        this._finish();
      }
    };
    this._worker.postMessage({ type: "connect", url });
  }

  send(data) {
    this._worker.postMessage({ type: "send", data });
  }

  close() {
    this._worker.postMessage({ type: "close" });
  }

  _finish() {
    this.readyState = WorkerSocket.CLOSED;
    this._worker.terminate();
    this.onclose?.();
  }
}
WorkerSocket.CONNECTING = 0;
WorkerSocket.OPEN = 1;
WorkerSocket.CLOSED = 3;

export function createGameSocket(url) {
  return typeof Worker === "undefined" ? new WebSocket(url) : new WorkerSocket(url);
}
