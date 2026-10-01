package instance_test

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/railsclient"
)

var (
	doorPos  = instanceconfig.Position{X: 50, Y: 50}
	awayPos  = instanceconfig.Position{X: 10, Y: 10}
	stairPos = instanceconfig.Position{X: 80, Y: 80}
)

func exitZone() instanceconfig.Zone {
	return instanceconfig.Zone{
		Name: "Z",
		Maps: []instanceconfig.Map{{
			Identifier:     "m",
			FeetDimensions: instanceconfig.Dimensions{Width: 100, Height: 100},
			Connections: []instanceconfig.MapConnection{
				{Identifier: "door", Type: "point", Position: &doorPos, FuzzRadius: 2},
				{Identifier: "stairs", Type: "point", Position: &stairPos, FuzzRadius: 2},
			},
		}},
	}
}

// exitInstance is an unstarted world-mode instance whose "m/door" is an
// exit, with one slot for world character wc-1.
func exitInstance(t *testing.T) (*instance.Instance, *instance.InstanceSlot) {
	t.Helper()
	inst := instance.NewInstance(uuid.New(), "db-1", "darkwood", "v1", "http://x", exitZone(), instance.DefaultMaxSlots)
	inst.Mode = instance.ModeWorld
	inst.Exits = map[string]bool{"m/door": true}
	inst.RailsClient = railsclient.New("http://unused", "t")
	slot, err := inst.AddSlotWithOptions("Aldric", "42", puncherClass, nil, nil, instance.SlotOptions{WorldCharacterDatabaseID: "wc-1"})
	require.NoError(t, err)
	return inst, slot
}

func playerAt(id uuid.UUID, pos instanceconfig.Position) *instancestate.InstanceState {
	return &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{
		id: {ZoneUnitIdentifier: "player:Aldric", MapIdentifier: "m", Position: pos, Status: instancestate.UnitStatusIdle},
	}}
}

func TestDetectZoneExits_FiresOnSteppingOntoAnExit(t *testing.T) {
	inst, slot := exitInstance(t)
	exits := inst.DetectZoneExitsForTest(playerAt(slot.CharacterUnitID, doorPos), playerAt(slot.CharacterUnitID, awayPos), time.Now())

	require.Len(t, exits, 1)
	assert.Equal(t, instance.PendingZoneExitForTest{
		SlotID: slot.ID, UnitID: slot.CharacterUnitID, WorldCharacterID: "wc-1", Connection: "m/door",
	}, exits[0])
}

func TestDetectZoneExits_NotWhileStandingOnTheExit(t *testing.T) {
	inst, slot := exitInstance(t)
	exits := inst.DetectZoneExitsForTest(playerAt(slot.CharacterUnitID, doorPos), playerAt(slot.CharacterUnitID, doorPos), time.Now())
	assert.Empty(t, exits)
}

func TestDetectZoneExits_NotForOtherConnections(t *testing.T) {
	inst, slot := exitInstance(t)
	exits := inst.DetectZoneExitsForTest(playerAt(slot.CharacterUnitID, stairPos), playerAt(slot.CharacterUnitID, awayPos), time.Now())
	assert.Empty(t, exits)
}

func TestDetectZoneExits_NotDuringTheLockout(t *testing.T) {
	inst, slot := exitInstance(t)
	now := time.Now()
	inst.ArmZoneExitsForTest(slot.CharacterUnitID, now)
	on, off := playerAt(slot.CharacterUnitID, doorPos), playerAt(slot.CharacterUnitID, awayPos)

	assert.Empty(t, inst.DetectZoneExitsForTest(on, off, now.Add(instance.ZoneExitLockout-time.Millisecond)))
	assert.Len(t, inst.DetectZoneExitsForTest(on, off, now.Add(instance.ZoneExitLockout)), 1)
}

func TestDetectZoneExits_OnlyOnceWhileInFlight(t *testing.T) {
	inst, slot := exitInstance(t)
	on, off := playerAt(slot.CharacterUnitID, doorPos), playerAt(slot.CharacterUnitID, awayPos)
	require.Len(t, inst.DetectZoneExitsForTest(on, off, time.Now()), 1)
	assert.Empty(t, inst.DetectZoneExitsForTest(on, off, time.Now()))
}

func TestDetectZoneExits_NotForNPCsOrDeadPlayers(t *testing.T) {
	inst, slot := exitInstance(t)
	npc := playerAt(slot.CharacterUnitID, doorPos)
	npc.Units[slot.CharacterUnitID].ZoneUnitIdentifier = "goblin_1"
	assert.Empty(t, inst.DetectZoneExitsForTest(npc, playerAt(slot.CharacterUnitID, awayPos), time.Now()))

	dead := playerAt(slot.CharacterUnitID, doorPos)
	dead.Units[slot.CharacterUnitID].Status = instancestate.UnitStatusDead
	assert.Empty(t, inst.DetectZoneExitsForTest(dead, playerAt(slot.CharacterUnitID, awayPos), time.Now()))
}

func TestDetectZoneExits_NotWithoutAWorldCharacter(t *testing.T) {
	inst, _ := exitInstance(t)
	other, err := inst.AddSlot("Brego", "43", puncherClass, nil, nil)
	require.NoError(t, err)
	exits := inst.DetectZoneExitsForTest(playerAt(other.CharacterUnitID, doorPos), playerAt(other.CharacterUnitID, awayPos), time.Now())
	assert.Empty(t, exits)
}

func readMsgOfType(t *testing.T, ch chan []byte, msgType string) map[string]any {
	t.Helper()
	msg := readMsg(t, ch)
	require.Equal(t, msgType, msg["type"])
	return msg
}

func TestFinishZoneExit_SuccessTellsClientAndRemovesSlot(t *testing.T) {
	inst, slot := exitInstance(t)
	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })
	exit := inst.DetectZoneExitsForTest(playerAt(slot.CharacterUnitID, doorPos), playerAt(slot.CharacterUnitID, awayPos), time.Now())[0]

	inst.FinishZoneExitForTest(exit, nil, time.Now())

	msg := readMsgOfType(t, writeCh, "zone-exit")
	assert.Equal(t, "m/door", msg["connection"])
	_, stillThere := inst.GetSlot(slot.ID)
	assert.False(t, stillThere)
}

func TestFinishZoneExit_FailureTellsClientAndRearmsAfterLockout(t *testing.T) {
	inst, slot := exitInstance(t)
	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })
	on, off := playerAt(slot.CharacterUnitID, doorPos), playerAt(slot.CharacterUnitID, awayPos)
	now := time.Now()
	exit := inst.DetectZoneExitsForTest(on, off, now)[0]

	inst.FinishZoneExitForTest(exit, errors.New("that exit leads nowhere"), now)

	msg := readMsgOfType(t, writeCh, "zone-exit-failed")
	assert.Equal(t, "that exit leads nowhere", msg["error"])
	_, stillThere := inst.GetSlot(slot.ID)
	assert.True(t, stillThere)
	assert.Empty(t, inst.DetectZoneExitsForTest(on, off, now.Add(time.Second)))
	assert.Len(t, inst.DetectZoneExitsForTest(on, off, now.Add(instance.ZoneExitLockout)), 1)
}
