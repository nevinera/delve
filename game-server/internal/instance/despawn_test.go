package instance_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestRemoveUnit_ClearsReferencesToIt(t *testing.T) {
	playerID, npcID, otherID := uuid.New(), uuid.New(), uuid.New()
	pid := playerID
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{
		playerID: {ZoneUnitIdentifier: "player:Aldric"},
		otherID:  {ZoneUnitIdentifier: "player:Brego"},
		npcID: {
			ZoneUnitIdentifier: "grunt_1",
			Status:             instancestate.UnitStatusEngaged,
			Target:             &pid,
			Attacking:          true,
			TaggedBy:           &pid,
			Casting:            &instancestate.CastState{TargetID: &pid},
			LootItems: []instancestate.PendingLootItem{{
				Claims: []instancestate.CharacterLootClaim{
					{CharacterUnitID: playerID},
					{CharacterUnitID: otherID},
				},
			}},
		},
	}}

	instance.RemoveUnitForTest(state, playerID)

	require.NotContains(t, state.Units, playerID)
	npc := state.Units[npcID]
	assert.Nil(t, npc.Target)
	assert.False(t, npc.Attacking)
	assert.Nil(t, npc.TaggedBy)
	assert.Nil(t, npc.Casting)
	assert.Equal(t, []instancestate.CharacterLootClaim{{CharacterUnitID: otherID}}, npc.LootItems[0].Claims)
}

func TestRemoveUnit_LeavesOtherReferencesAlone(t *testing.T) {
	playerID, otherID, npcID := uuid.New(), uuid.New(), uuid.New()
	oid := otherID
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{
		playerID: {},
		otherID:  {},
		npcID:    {Target: &oid, TaggedBy: &oid, Casting: &instancestate.CastState{TargetID: &oid}},
	}}

	instance.RemoveUnitForTest(state, playerID)

	npc := state.Units[npcID]
	assert.Equal(t, otherID, *npc.Target)
	assert.Equal(t, otherID, *npc.TaggedBy)
	assert.NotNil(t, npc.Casting)
}

// waitForUnitRemoval reads deltas from writeCh until one lists unitID in
// unit_removals.
func waitForUnitRemoval(t *testing.T, writeCh chan []byte, unitID uuid.UUID) {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatalf("unit %s was never removed", unitID)
		default:
		}
		msg := readMsg(t, writeCh)
		removals, _ := msg["unit_removals"].([]any)
		for _, r := range removals {
			if r == unitID.String() {
				return
			}
		}
	}
}

func TestRemoveSlot_DespawnsCharacterUnit(t *testing.T) {
	inst := startedGoblinInstance(t)
	leaving, err := inst.AddSlot("Aldric", "42", puncherClass, nil, nil)
	require.NoError(t, err)
	_, _, leavingDone, ok := inst.ConnectSlot(leaving.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(leavingDone) })

	watcher, err := inst.AddSlot("Brego", "43", puncherClass, nil, nil)
	require.NoError(t, err)
	writeCh, _, done, ok := inst.ConnectSlot(watcher.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })
	units := receiveFullState(t, writeCh)
	require.Contains(t, units, leaving.CharacterUnitID.String())

	require.True(t, inst.RemoveSlot(leaving.ID))
	waitForUnitRemoval(t, writeCh, leaving.CharacterUnitID)
}

func TestPruneStaleSlots_DespawnsCharacterUnit(t *testing.T) {
	inst := instance.NewInstance(uuid.New(), "db-1", "zone-test", "v1", "http://x", goblinZone(), instance.DefaultMaxSlots)
	inst.SlotWaitTimeout = 50 * time.Millisecond
	require.NoError(t, inst.Start(nil))
	t.Cleanup(inst.Stop)
	stale, err := inst.AddSlot("Aldric", "42", puncherClass, nil, nil)
	require.NoError(t, err)
	_, _, staleDone, ok := inst.ConnectSlot(stale.ID)
	require.True(t, ok)
	close(staleDone)

	watcher, err := inst.AddSlot("Brego", "43", puncherClass, nil, nil)
	require.NoError(t, err)
	writeCh, _, done, ok := inst.ConnectSlot(watcher.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })
	units := receiveFullState(t, writeCh)
	require.Contains(t, units, stale.CharacterUnitID.String())

	inst.DisconnectSlot(stale.ID)
	waitForUnitRemoval(t, writeCh, stale.CharacterUnitID)
}
