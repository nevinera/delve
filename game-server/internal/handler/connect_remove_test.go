package handler_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestConnect_RemovedSlotClosesConnection(t *testing.T) {
	reg := instance.NewRegistry()
	inst := addTestInstance(t, reg)
	slot, err := inst.AddSlot("Aldric", "42", instanceconfig.CharacterClass{
		Name: "Puncher", Colors: instanceconfig.Colors{Major: "8B4513", Minor: "F4A460"},
	}, nil, nil)
	require.NoError(t, err)
	wsBase := startWS(t, mountConnect(reg))

	conn, _, err := dialConnect(wsBase, inst.Identifier.String(), slot.ID.String(), slot.Token.String())
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()
	waitState(t, inst, slot.ID, instance.SlotStateConnected)

	require.True(t, inst.RemoveSlot(slot.ID))

	// Reads drain whatever state messages were already sent, then fail once
	// the server's close frame arrives.
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			require.NotContains(t, err.Error(), "timeout", "connection should close, not time out")
			return
		}
	}
}
