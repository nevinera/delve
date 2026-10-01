package instance_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/railsclient"
)

func TestFireLootAward_DirectModeNeverCallsRails(t *testing.T) {
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusCreated)
	}))
	t.Cleanup(server.Close)

	inst := makeInstance()
	inst.Mode = instance.ModeDirect
	inst.RailsClient = railsclient.New(server.URL, "token")
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, nil)
	require.NoError(t, err)

	claim := &instancestate.LootClaim{ClaimedBy: slot.CharacterUnitID, Result: make(chan instancestate.LootResult, 1)}
	inst.FireLootAwardForTest(context.Background(), instancestate.PendingLootClaim{
		TargetUnitID: uuid.New(),
		Claim:        claim,
		Item:         instanceconfig.Item{Identifier: "sword"},
	})

	assert.Equal(t, instancestate.LootResult{}, <-claim.Result)
	assert.False(t, called)
}
