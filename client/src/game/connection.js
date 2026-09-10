import { computeChecksum } from "./checksum";
import { applyFullState, applyDelta } from "./state";

const HEARTBEAT_MS = 300;
const HEARTBEAT_HISTORY = 20;

export class GameConnection {
  constructor({
    gameServerUrl,
    instanceId,
    slotId,
    slotToken,
    onOpen,
    onClose,
    onStateChange,
    // Artificial one-way delay applied to every send and every receive, for
    // reproducing latency-dependent bugs (e.g. movement reconciliation)
    // without relying on Chrome's network throttling - which throttles the
    // WebSocket's opening HTTP handshake but not its ongoing frame traffic,
    // and has no jitter control at all. simulatedJitterMs adds independent
    // uniform random variance (+/-) to each direction of each message.
    simulatedLatencyMs = 0,
    simulatedJitterMs = 0,
  }) {
    this._onOpen = onOpen;
    this._onClose = onClose;
    this._onStateChange = onStateChange;
    this._simulatedLatencyMs = simulatedLatencyMs;
    this._simulatedJitterMs = simulatedJitterMs;

    const url = new URL(gameServerUrl);
    const scheme = url.protocol === "https:" ? "wss" : "ws";
    this._wsUrl = `${scheme}://${url.host}/instances/${instanceId}/slots/${slotId}/connect?token=${slotToken}`;

    this._ws = null;
    this._heartbeatTimer = null;
    this._units = {};
    this._beatId = 0;
    // beat_id -> the local Date.now() it was sent at, so rttForBeat can
    // measure round-trip time once the server echoes that beat_id back on
    // our own unit (see last_heartbeat_beat_id in state.js). Bounded to the
    // last HEARTBEAT_HISTORY sends since beat_id only increases.
    this._heartbeatSentAt = new Map();
  }

  connect() {
    this._ws = new WebSocket(this._wsUrl);

    this._ws.onopen = () => {
      this._heartbeatTimer = setInterval(() => {
        this._beatId += 1;
        this._heartbeatSentAt.set(this._beatId, Date.now());
        this._heartbeatSentAt.delete(this._beatId - HEARTBEAT_HISTORY);
        this._send({ direction: "up", type: "heartbeat", beat_id: this._beatId });
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
      const delayMs = this._simulatedDelayMs();
      if (delayMs > 0) {
        setTimeout(() => this._handleMessage(msg), delayMs);
      } else {
        this._handleMessage(msg);
      }
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
      this._onStateChange?.({ units: this._units, combatEvents: msg.combat_events ?? [], lootEvents: msg.loot_events ?? [], lootFailures: msg.loot_failures ?? [] });
    }
  }

  // Round-trip time in ms for a beat_id echoed back by the server on our own
  // unit's last_heartbeat_beat_id, or null if we no longer have that send
  // recorded (evicted, or from before this connection).
  rttForBeat(beatId) {
    const sentAt = this._heartbeatSentAt.get(beatId);
    return sentAt == null ? null : Date.now() - sentAt;
  }

  // Base delay plus independent uniform jitter in [-jitter, +jitter], floored
  // at 0. Called separately per direction per message, so send/receive delay
  // (and beat_id RTT, since it spans both) vary independently rather than by
  // a fixed offset - closer to real network jitter than a constant delay.
  _simulatedDelayMs() {
    if (!this._simulatedLatencyMs && !this._simulatedJitterMs) return 0;
    const jitter = this._simulatedJitterMs ? (Math.random() * 2 - 1) * this._simulatedJitterMs : 0;
    return Math.max(0, this._simulatedLatencyMs + jitter);
  }

  _send(data) {
    if (this._ws?.readyState !== WebSocket.OPEN) return;
    const payload = JSON.stringify(data);
    const delayMs = this._simulatedDelayMs();
    if (delayMs > 0) {
      setTimeout(() => {
        if (this._ws?.readyState === WebSocket.OPEN) this._ws.send(payload);
      }, delayMs);
    } else {
      this._ws.send(payload);
    }
  }
}
