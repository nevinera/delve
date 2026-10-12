package instance_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestTickCasts_AFinishedInteractableCastIsAUse(t *testing.T) {
	now := time.Now()
	player := uuid.New()
	snare := instanceconfig.Interactable{Identifier: "snare-1", Name: "Goblin Snare"}
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{player: {
		ZoneUnitIdentifier: "player:42", MapIdentifier: "hills", Status: instancestate.UnitStatusIdle,
		Casting: &instancestate.CastState{Interactable: &snare, StartedAt: now, EndsAt: now.Add(time.Second)},
	}}}

	instance.TickCastsForTest(state, instanceconfig.Zone{}, now.Add(500*time.Millisecond))
	assert.NotNil(t, state.Units[player].Casting, "still using it")
	assert.Empty(t, state.PendingUses)

	events := instance.TickCastsForTest(state, instanceconfig.Zone{}, now.Add(time.Second))
	assert.Nil(t, state.Units[player].Casting)
	assert.Equal(t, []instancestate.Use{{UnitID: player, Interactable: "snare-1", Map: "hills"}}, state.PendingUses)
	assert.Empty(t, events, "no combat event")
}

func TestCastingJSON_NamesAnInteractableCastByItsUseTextOrName(t *testing.T) {
	snare := instanceconfig.Interactable{Name: "Goblin Snare"}
	assert.Equal(t, "Goblin Snare", instance.CastingNameForTest(&instancestate.CastState{Interactable: &snare}))
	snare.UseText = "Cutting"
	assert.Equal(t, "Cutting", instance.CastingNameForTest(&instancestate.CastState{Interactable: &snare}))
}

// snareInstance is progressInstance's, with snares active too: use snares
// 1 and 2 on the hills.
func snareInstance(t *testing.T) (*instance.Instance, *fakeQuestRails, *instance.InstanceSlot, chan []byte) {
	t.Helper()
	snares := instanceconfig.ActiveQuest{QuestIdentifier: "snares", WorldVersionID: "wv-2", Objectives: []instanceconfig.ActiveObjective{
		activeObjective("cut-snares", instanceconfig.QuestObjective{Type: "use", Zone: "darkwood", Map: "hills", Interactables: []string{"snare-1", "snare-2"}}, 0, 2),
	}}
	rails := &fakeQuestRails{active: map[string]instanceconfig.ActiveQuest{"snares": snares}}
	inst := questInstance(t, rails)
	inst.Quests = []instanceconfig.Quest{{Identifier: "snares", OfferedBy: instanceconfig.NcuRef{Zone: "goblin-cave", NCU: "grizzle"}}}
	slot, err := inst.AddSlotWithOptions("Aldric", "42", puncherClass, nil, nil,
		instance.SlotOptions{WorldCharacterDatabaseID: "wc-1", ActiveQuests: []instanceconfig.ActiveQuest{snares}})
	require.NoError(t, err)
	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })
	return inst, rails, slot, writeCh
}

func TestCollectQuestEvents_FindsUses(t *testing.T) {
	inst, _, slot, _ := snareInstance(t)
	state := &instancestate.InstanceState{PendingUses: []instancestate.Use{{UnitID: slot.CharacterUnitID, Interactable: "snare-1", Map: "hills"}}}
	assert.Equal(t, []instance.QuestEventForTest{{UnitID: slot.CharacterUnitID, Type: "use", Interactable: "snare-1", Map: "hills"}},
		inst.CollectQuestEventsForTest(state, state))
}

func TestApplyQuestEvents_RecordsEachInteractableOnce_ThenCompletes(t *testing.T) {
	inst, rails, slot, writeCh := snareInstance(t)
	use := func(identifier, mapID string) {
		inst.ApplyQuestEvents(context.Background(), []instance.QuestEventForTest{{UnitID: slot.CharacterUnitID, Type: "use", Interactable: identifier, Map: mapID}})
	}

	use("snare-1", "hills")
	msg := nextMessage(t, writeCh)
	assert.Equal(t, "quest-progress", msg["type"])
	assert.EqualValues(t, 1, msg["count"])
	assert.Equal(t, []any{"snare-1"}, msg["used"])

	use("snare-1", "hills") // again: already used
	use("snare-3", "hills") // not listed
	use("snare-2", "woods") // not on the objective's map
	got, _ := inst.GetSlot(slot.ID)
	assert.Equal(t, []string{"snare-1"}, got.Quests["snares"].Objectives[0].Used)
	assert.Empty(t, rails.completed)

	use("snare-2", "hills")
	msg = nextMessage(t, writeCh)
	assert.Equal(t, []any{"snare-1", "snare-2"}, msg["used"])
	assert.Equal(t, []string{"snares"}, rails.completed)
}
