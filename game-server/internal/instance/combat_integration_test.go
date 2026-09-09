package instance_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// drainHealth reads messages from writeCh for `window`, returning the last
// health value seen for unitID (from a full-state or delta message), or nil
// if none arrived.
func drainHealth(t *testing.T, writeCh chan []byte, unitID uuid.UUID, window time.Duration) *float64 {
	t.Helper()
	idStr := unitID.String()
	var result *float64
	deadline := time.After(window)
	for {
		select {
		case msg := <-writeCh:
			var parsed struct {
				Units       map[string]map[string]any `json:"units"`
				UnitUpdates map[string]map[string]any `json:"unit_updates"`
			}
			require.NoError(t, json.Unmarshal(msg, &parsed))
			if u, ok := parsed.Units[idStr]; ok {
				if h, ok := u["health"].(float64); ok {
					result = &h
				}
			}
			if u, ok := parsed.UnitUpdates[idStr]; ok {
				if h, ok := u["health"].(float64); ok {
					result = &h
				}
			}
		case <-deadline:
			return result
		}
	}
}

// TestBasicAttack_EndToEnd_DamagesTarget reproduces the full production
// path (AddSlot -> ConnectSlot -> spawn -> target/start_attacking/
// basic_attack commands, resolved by the real running tick loop) rather
// than calling BasicAttackHandler.Handle directly against a hand-built
// UnitState. This is here specifically to catch integration-level wiring
// bugs (e.g. equipped items or class data not actually reaching the spawned
// UnitState) that a handler-level unit test can't see.
func TestBasicAttack_EndToEnd_DamagesTarget(t *testing.T) {
	reg := instance.NewRegistry()
	inst := startedInstance(t, reg)
	t.Cleanup(inst.Stop)

	attackerClass := instanceconfig.CharacterClass{Name: "Puncher", PrimaryStats: []string{"strength"}}
	equipped := map[string]instanceconfig.EquippedItem{
		"main_hand": {Slot: "main_hand", Elvl: 0, PrimaryStat: strPtr("strength"), SecondaryStats: []string{"stamina", "crit_rating", "haste_rating"}},
	}
	attackerSlot, err := inst.AddSlot("Attacker", "1", attackerClass, nil, equipped)
	require.NoError(t, err)
	targetSlot, err := inst.AddSlot("Target", "2", puncherClass, nil, nil)
	require.NoError(t, err)

	_, _, doneAttacker, ok := inst.ConnectSlot(attackerSlot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(doneAttacker) })

	targetWriteCh, _, doneTarget, ok := inst.ConnectSlot(targetSlot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(doneTarget) })

	initialHealth := drainHealth(t, targetWriteCh, targetSlot.CharacterUnitID, 300*time.Millisecond)
	require.NotNil(t, initialHealth, "expected an initial full-state message with the target's health")

	targetUnitID := targetSlot.CharacterUnitID
	inst.SendCommand(command.Command{UnitID: attackerSlot.CharacterUnitID, ReceivedAt: time.Now(), Payload: command.TargetPayload{TargetID: &targetUnitID}})
	inst.SendCommand(command.Command{UnitID: attackerSlot.CharacterUnitID, ReceivedAt: time.Now(), Payload: command.StartAttackingPayload{}})

	// Basic attacks miss 5% of the time - retry a few swings (waiting past
	// the swing timer each time) so this isn't flaky.
	last := initialHealth
	for i := 0; i < 5; i++ {
		inst.SendCommand(command.Command{UnitID: attackerSlot.CharacterUnitID, ReceivedAt: time.Now(), Payload: command.BasicAttackPayload{}})
		if h := drainHealth(t, targetWriteCh, targetSlot.CharacterUnitID, 2200*time.Millisecond); h != nil {
			last = h
		}
		if *last < *initialHealth {
			return
		}
	}
	t.Fatalf("target health never decreased after 5 basic attacks (started at %v, now %v)", *initialHealth, *last)
}
