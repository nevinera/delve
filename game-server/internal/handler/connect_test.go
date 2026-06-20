package handler_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/handler"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestMain(m *testing.M) {
	handler.HeartbeatTimeout = 100 * time.Millisecond
	os.Exit(m.Run())
}

// mountConnect builds a router exposing only the connect route.
func mountConnect(reg *instance.Registry) http.Handler {
	r := chi.NewRouter()
	sh := handler.NewSlots(reg, 200, instance.DefaultMaxSlots)
	r.Get("/instances/{instanceID}/slots/{slotID}/connect", sh.Connect)
	return r
}

// startWS starts a test HTTP server and returns its base WebSocket URL.
func startWS(t *testing.T, h http.Handler) string {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return "ws" + strings.TrimPrefix(srv.URL, "http")
}

// dialConnect dials the connect endpoint for the given instance and slot.
func dialConnect(wsBase, instanceID, slotID, token string) (*websocket.Conn, *http.Response, error) {
	url := fmt.Sprintf("%s/instances/%s/slots/%s/connect?token=%s",
		wsBase, instanceID, slotID, token)
	return websocket.DefaultDialer.Dial(url, nil)
}

// waitState polls until slot.State == want or the deadline passes.
func waitState(t *testing.T, inst *instance.Instance, slotID uuid.UUID, want instance.SlotState) {
	t.Helper()
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if s, ok := inst.GetSlot(slotID); ok && s.State == want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	s, _ := inst.GetSlot(slotID)
	t.Errorf("slot state = %v, want %v after 500ms", s.State, want)
}

// --- Auth / not-found rejections (no WebSocket upgrade) ---

func TestConnect_InstanceNotFound(t *testing.T) {
	reg := instance.NewRegistry()
	wsBase := startWS(t, mountConnect(reg))

	_, resp, err := dialConnect(wsBase, uuid.New().String(), uuid.New().String(), "tok")
	require.Error(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestConnect_SlotNotFound(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	wsBase := startWS(t, mountConnect(reg))

	_, resp, err := dialConnect(wsBase, inst.Identifier.String(), uuid.New().String(), "tok")
	require.Error(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestConnect_MissingToken(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)
	wsBase := startWS(t, mountConnect(reg))

	// Dial without ?token= at all.
	url := fmt.Sprintf("%s/instances/%s/slots/%s/connect",
		wsBase, inst.Identifier, slot.ID)
	_, resp, err := websocket.DefaultDialer.Dial(url, nil)
	require.Error(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestConnect_WrongToken(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)
	wsBase := startWS(t, mountConnect(reg))

	_, resp, err := dialConnect(wsBase, inst.Identifier.String(), slot.ID.String(), "wrong-token")
	require.Error(t, err)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestConnect_NoUpgradeHeaders(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)
	srv := httptest.NewServer(mountConnect(reg))
	t.Cleanup(srv.Close)

	url := fmt.Sprintf("%s/instances/%s/slots/%s/connect?token=%s",
		srv.URL, inst.Identifier, slot.ID, slot.Token)
	resp, err := http.Get(url) //nolint:noctx
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// --- Successful connection ---

func TestConnect_SetsStateConnected(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)
	wsBase := startWS(t, mountConnect(reg))

	conn, _, err := dialConnect(wsBase, inst.Identifier.String(), slot.ID.String(), slot.Token.String())
	require.NoError(t, err)
	defer conn.Close()

	waitState(t, inst, slot.ID, instance.SlotStateConnected)
}

func TestConnect_CloseTransitionsToWaiting(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)
	wsBase := startWS(t, mountConnect(reg))

	conn, _, err := dialConnect(wsBase, inst.Identifier.String(), slot.ID.String(), slot.Token.String())
	require.NoError(t, err)

	waitState(t, inst, slot.ID, instance.SlotStateConnected)
	conn.Close()

	waitState(t, inst, slot.ID, instance.SlotStateWaiting)
}

func TestConnect_HeartbeatTimeoutTransitionsToWaiting(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)
	wsBase := startWS(t, mountConnect(reg))

	conn, _, err := dialConnect(wsBase, inst.Identifier.String(), slot.ID.String(), slot.Token.String())
	require.NoError(t, err)
	defer conn.Close()

	waitState(t, inst, slot.ID, instance.SlotStateConnected)

	// Don't send any messages. The server should time out and close the connection.
	conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	_, _, _ = conn.ReadMessage() // expect close frame or error

	waitState(t, inst, slot.ID, instance.SlotStateWaiting)
}

func TestConnect_HeartbeatResetsTimeout(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)
	wsBase := startWS(t, mountConnect(reg))

	conn, _, err := dialConnect(wsBase, inst.Identifier.String(), slot.ID.String(), slot.Token.String())
	require.NoError(t, err)
	defer conn.Close()

	waitState(t, inst, slot.ID, instance.SlotStateConnected)

	// Send a heartbeat just before the timeout would fire, three times.
	for range 3 {
		time.Sleep(80 * time.Millisecond)
		err := conn.WriteMessage(websocket.TextMessage, []byte(`{"direction":"up","type":"heartbeat"}`))
		require.NoError(t, err)
	}

	// Slot should still be connected.
	s, ok := inst.GetSlot(slot.ID)
	require.True(t, ok)
	assert.Equal(t, instance.SlotStateConnected, s.State)
}

func TestConnect_ReconnectKicksOldConnection(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	slot, err := inst.AddSlot("Aldric", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	})
	require.NoError(t, err)
	wsBase := startWS(t, mountConnect(reg))

	conn1, _, err := dialConnect(wsBase, inst.Identifier.String(), slot.ID.String(), slot.Token.String())
	require.NoError(t, err)
	defer conn1.Close()

	waitState(t, inst, slot.ID, instance.SlotStateConnected)

	// Second connection should displace the first.
	conn2, _, err := dialConnect(wsBase, inst.Identifier.String(), slot.ID.String(), slot.Token.String())
	require.NoError(t, err)
	defer conn2.Close()

	// conn1 should receive a close frame.
	conn1.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	_, _, readErr := conn1.ReadMessage()
	assert.Error(t, readErr, "first connection should be closed by reconnect")

	// Slot should remain connected (to conn2).
	waitState(t, inst, slot.ID, instance.SlotStateConnected)
}
