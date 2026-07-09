package handler

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instance"
)

// HeartbeatTimeout is the maximum silence between client messages before the
// connection is considered dropped. Exported so tests can shorten it.
var HeartbeatTimeout = 1500 * time.Millisecond

var upgrader = websocket.Upgrader{
	// Allow all origins; the slot token in the query param is the auth mechanism.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Connect handles GET /instances/{instanceID}/slots/{slotID}/connect.
// The request is upgraded to a WebSocket; auth is via ?token=<slot-token>
// rather than Bearer because the browser WebSocket API cannot set custom headers.
func (h *Slots) Connect(w http.ResponseWriter, r *http.Request) {
	inst, ok := h.instanceFromURL(w, r)
	if !ok {
		return
	}
	slotID, ok := slotIDFromURL(w, r)
	if !ok {
		return
	}
	slot, ok := inst.GetSlot(slotID)
	if !ok {
		writeError(w, r, http.StatusNotFound, "slot not found")
		return
	}

	token := r.URL.Query().Get("token")
	if token == "" || token != slot.Token.String() {
		writeError(w, r, http.StatusUnauthorized, "invalid or missing slot token")
		return
	}

	writeCh, ctx, done, ok := inst.ConnectSlot(slotID)
	if !ok {
		writeError(w, r, http.StatusNotFound, "slot not found")
		return
	}
	defer func() {
		inst.DisconnectSlot(slotID)
		close(done)
	}()

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	// quit is closed by the read loop when it exits, signalling the write
	// goroutine to stop regardless of whether ctx was cancelled.
	quit := make(chan struct{})

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case msg, ok := <-writeCh:
				if !ok {
					return
				}
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					return
				}
			case <-ctx.Done():
				// Kicked by a reconnect — send a close frame and stop.
				conn.WriteControl(
					websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseGoingAway, "reconnected"),
					time.Now().Add(time.Second),
				)
				conn.Close()
				return
			case <-quit:
				return
			}
		}
	}()

	conn.SetReadDeadline(time.Now().Add(HeartbeatTimeout))
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		conn.SetReadDeadline(time.Now().Add(HeartbeatTimeout))
		handleClientMessage(data, slot.CharacterUnitID, inst)
	}

	close(quit)
	wg.Wait()
}

type incomingMsg struct {
	Type     string   `json:"type"`
	Facing   float64  `json:"facing"`
	Keys     []string `json:"keys"`
	X        *float64 `json:"x"`
	Y        *float64 `json:"y"`
	TargetID *string  `json:"target_id"`
}

func handleClientMessage(data []byte, unitID uuid.UUID, inst *instance.Instance) {
	var msg incomingMsg
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}
	switch msg.Type {
	case "move":
		keys := make([]command.MoveKey, len(msg.Keys))
		for i, k := range msg.Keys {
			keys[i] = command.MoveKey(k)
		}
		inst.SendCommand(command.Command{
			UnitID:     unitID,
			ReceivedAt: time.Now(),
			Payload:    command.MovePayload{Facing: msg.Facing, Keys: keys, X: msg.X, Y: msg.Y},
		})
	case "target":
		var targetID *uuid.UUID
		if msg.TargetID != nil {
			if id, err := uuid.Parse(*msg.TargetID); err == nil {
				targetID = &id
			}
		}
		inst.SendCommand(command.Command{
			UnitID:     unitID,
			ReceivedAt: time.Now(),
			Payload:    command.TargetPayload{TargetID: targetID},
		})
	}
}
