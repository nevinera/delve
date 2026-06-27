package handler_test

import (
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// safeWriter serializes websocket writes since gorilla's conn is not concurrent-safe.
type safeWriter struct {
	mu   sync.Mutex
	conn *websocket.Conn
}

func (w *safeWriter) send(msg string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.conn.WriteMessage(websocket.TextMessage, []byte(msg))
}

// keepAlive sends heartbeats every 50ms until stop is closed.
func keepAlive(w *safeWriter, stop <-chan struct{}) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			_ = w.send(`{"direction":"up","type":"heartbeat"}`)
		}
	}
}

func TestConnect_MoveCommand_UpdatesPosition(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	wsBase := startWS(t, mountConnect(reg))

	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)

	conn, _, err := dialConnect(wsBase, inst.Identifier.String(), slot.ID.String(), slot.Token.String())
	require.NoError(t, err)
	defer conn.Close()

	w := &safeWriter{conn: conn}
	stopHeartbeats := make(chan struct{})
	defer close(stopHeartbeats)
	go keepAlive(w, stopHeartbeats)

	// Wait for the full state (confirms player unit is spawned and slot is live).
	conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	_, fullStateData, err := conn.ReadMessage()
	require.NoError(t, err)
	var fullState map[string]any
	require.NoError(t, json.Unmarshal(fullStateData, &fullState))
	require.Equal(t, "instance-state", fullState["type"])

	// Send a move command: forward, facing north (angle=0 → Y increases).
	require.NoError(t, w.send(`{"direction":"up","type":"move","facing":0,"keys":["forward"]}`))

	// Read deltas until position changes for our player unit.
	unitIDStr := slot.CharacterUnitID.String()
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		conn.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var delta map[string]any
		if err := json.Unmarshal(data, &delta); err != nil || delta["type"] != "delta" {
			continue
		}
		updates, _ := delta["unit_updates"].(map[string]any)
		patch, _ := updates[unitIDStr].(map[string]any)
		if _, hasPos := patch["position"]; hasPos {
			pos := patch["position"].(map[string]any)
			assert.Greater(t, pos["y"].(float64), 0.0, "Y should increase when moving forward facing north")
			return
		}
	}
	t.Fatal("player unit position did not update after move command")
}

func TestConnect_UnknownMessageType_DoesNotDisconnect(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	wsBase := startWS(t, mountConnect(reg))

	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)

	conn, _, err := dialConnect(wsBase, inst.Identifier.String(), slot.ID.String(), slot.Token.String())
	require.NoError(t, err)
	defer conn.Close()

	waitState(t, inst, slot.ID, instance.SlotStateConnected)

	// Send an unrecognised message type.
	err = conn.WriteMessage(websocket.TextMessage, []byte(`{"direction":"up","type":"shrug"}`))
	require.NoError(t, err)

	// Slot should remain connected.
	time.Sleep(50 * time.Millisecond)
	s, ok := inst.GetSlot(slot.ID)
	require.True(t, ok)
	assert.Equal(t, instance.SlotStateConnected, s.State)
}

func TestConnect_MalformedJSON_DoesNotDisconnect(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	wsBase := startWS(t, mountConnect(reg))

	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)

	conn, _, err := dialConnect(wsBase, inst.Identifier.String(), slot.ID.String(), slot.Token.String())
	require.NoError(t, err)
	defer conn.Close()

	waitState(t, inst, slot.ID, instance.SlotStateConnected)

	err = conn.WriteMessage(websocket.TextMessage, []byte(`not json at all`))
	require.NoError(t, err)

	time.Sleep(50 * time.Millisecond)
	s, ok := inst.GetSlot(slot.ID)
	require.True(t, ok)
	assert.Equal(t, instance.SlotStateConnected, s.State)
}
