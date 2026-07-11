import { computeChecksum } from "./checksum";
import { applyFullState, applyDelta } from "./state";

const HEARTBEAT_MS = 300;

export class GameConnection {
  constructor({ gameServerUrl, instanceId, slotId, slotToken, onOpen, onClose, onStateChange }) {
    this._onOpen = onOpen;
    this._onClose = onClose;
    this._onStateChange = onStateChange;

    const url = new URL(gameServerUrl);
    const scheme = url.protocol === "https:" ? "wss" : "ws";
    this._wsUrl = `${scheme}://${url.host}/instances/${instanceId}/slots/${slotId}/connect?token=${slotToken}`;

    this._ws = null;
    this._heartbeatTimer = null;
    this._units = {};
  }

  connect() {
    this._ws = new WebSocket(this._wsUrl);

    this._ws.onopen = () => {
      this._heartbeatTimer = setInterval(() => {
        this._send({ direction: "up", type: "heartbeat" });
      }, HEARTBEAT_MS);
      this._onOpen?.();
    };

    this._ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      this._handleMessage(msg);
    };

    this._ws.onclose = () => {
      clearInterval(this._heartbeatTimer);
      this._onClose?.();
    };

    this._ws.onerror = (e) => {
      console.error("WebSocket error", e);
    };
  }

  send(data) {
    this._send(data);
  }

  close() {
    clearInterval(this._heartbeatTimer);
    this._ws?.close();
  }

  async _handleMessage(msg) {
    if (msg.direction !== "down") return;

    if (msg.type === "instance-state") {
      this._units = applyFullState(msg);
      const local = await computeChecksum(this._units);
      if (local !== msg.checksum) {
        console.warn("checksum mismatch after full state", { server: msg.checksum, local });
      }
      this._onStateChange?.({ units: this._units });
    } else if (msg.type === "delta") {
      this._units = applyDelta(this._units, msg);
      const local = await computeChecksum(this._units);
      if (local !== msg.checksum) {
        console.warn("checksum mismatch after delta", { server: msg.checksum, local });
        this._send({ direction: "up", type: "full-state-request" });
      }
      this._onStateChange?.({ units: this._units, combatEvents: msg.combat_events ?? [] });
    }
  }

  _send(data) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }
}
