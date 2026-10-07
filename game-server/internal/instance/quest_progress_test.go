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

// Offered in another zone, so completing them here sends no new offers.
var progressQuests = []instanceconfig.Quest{
	{Identifier: "rat-hunt", OfferedBy: instanceconfig.NcuRef{Zone: "goblin-cave", NCU: "grizzle"}},
	{Identifier: "deliver", OfferedBy: instanceconfig.NcuRef{Zone: "goblin-cave", NCU: "grizzle"},
		TurnIn: &instanceconfig.NcuRef{Zone: "darkwood", NCU: "warden"}},
	{Identifier: "timed", OfferedBy: instanceconfig.NcuRef{Zone: "goblin-cave", NCU: "grizzle"}, Timer: "20s"},
}

func activeObjective(hash string, objective instanceconfig.QuestObjective, count, required int) instanceconfig.ActiveObjective {
	return instanceconfig.ActiveObjective{Hash: hash, Objective: objective, Count: count, Required: required}
}

// progressInstance is a darkwood instance whose one slot has rat-hunt (kill
// two rats), deliver (talk to the warden, reach the cellar; turned in to
// the warden) and timed (reach the tower within 20s) active.
func progressInstance(t *testing.T) (*instance.Instance, *fakeQuestRails, *instance.InstanceSlot, chan []byte) {
	t.Helper()
	active := []instanceconfig.ActiveQuest{
		{QuestIdentifier: "rat-hunt", WorldVersionID: "wv-2", Objectives: []instanceconfig.ActiveObjective{
			activeObjective("kill-rats", instanceconfig.QuestObjective{Type: "kill", Zone: "darkwood", UnitType: "rat", Count: 2}, 0, 2),
		}},
		{QuestIdentifier: "deliver", WorldVersionID: "wv-2", Objectives: []instanceconfig.ActiveObjective{
			activeObjective("talk-warden", instanceconfig.QuestObjective{Type: "talk", Zone: "darkwood", NCU: "warden"}, 0, 1),
			activeObjective("reach-cellar", instanceconfig.QuestObjective{Type: "reach", Zone: "darkwood", Map: "cellar"}, 0, 1),
		}},
		{QuestIdentifier: "timed", WorldVersionID: "wv-2", Objectives: []instanceconfig.ActiveObjective{
			activeObjective("reach-tower", instanceconfig.QuestObjective{Type: "reach", Zone: "darkwood", Map: "tower"}, 0, 1),
		}},
	}
	rails := &fakeQuestRails{active: map[string]instanceconfig.ActiveQuest{}}
	for _, quest := range active {
		rails.active[quest.QuestIdentifier] = quest
	}
	inst := questInstance(t, rails)
	inst.Quests = progressQuests
	slot, err := inst.AddSlotWithOptions("Aldric", "42", puncherClass, nil, nil,
		instance.SlotOptions{WorldCharacterDatabaseID: "wc-1", ActiveQuests: active})
	require.NoError(t, err)
	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })
	return inst, rails, slot, writeCh
}

func TestCollectQuestEvents_FindsTalksTaggedKillsAndArrivals(t *testing.T) {
	inst, _, slot, _ := progressInstance(t)
	player, rat, untagged := slot.CharacterUnitID, uuid.New(), uuid.New()
	unit := func(identifier, unitType, mapID string, status instancestate.UnitStatus, taggedBy *uuid.UUID) *instancestate.UnitState {
		return &instancestate.UnitState{ZoneUnitIdentifier: identifier, UnitTypeIdentifier: unitType, MapIdentifier: mapID, Status: status, TaggedBy: taggedBy}
	}
	prev := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{
		player:   unit("player:42", "", "yard", instancestate.UnitStatusIdle, nil),
		rat:      unit("rat-1", "rat", "yard", instancestate.UnitStatusEngaged, &player),
		untagged: unit("rat-2", "rat", "yard", instancestate.UnitStatusIdle, nil),
	}}
	curr := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{
			player:   unit("player:42", "", "cellar", instancestate.UnitStatusIdle, nil),
			rat:      unit("rat-1", "rat", "yard", instancestate.UnitStatusDead, &player),
			untagged: unit("rat-2", "rat", "yard", instancestate.UnitStatusDead, nil),
		},
		PendingTalks: []instancestate.Talk{
			{UnitID: player, NCUIdentifier: "warden"},
			{UnitID: player, NCUIdentifier: "warden", AcceptQuest: "rat-hunt"},
		},
	}

	events := inst.CollectQuestEventsForTest(prev, curr)
	assert.ElementsMatch(t, []instance.QuestEventForTest{
		{UnitID: player, Type: "talk", NCU: "warden"},
		{UnitID: player, Type: "reach", Map: "cellar"},
		{UnitID: player, Type: "kill", Unit: "rat-1", UnitType: "rat", Map: "yard"},
	}, events)

	curr.PendingTalks = nil
	assert.Empty(t, inst.CollectQuestEventsForTest(curr, curr), "nothing changed")
}

func TestApplyQuestEvents_RecordsProgress(t *testing.T) {
	inst, rails, slot, writeCh := progressInstance(t)
	inst.ApplyQuestEvents(context.Background(), []instance.QuestEventForTest{
		{UnitID: slot.CharacterUnitID, Type: "kill", Unit: "rat-1", UnitType: "rat", Map: "yard"},
	})

	msg := nextMessage(t, writeCh)
	assert.Equal(t, "quest-progress", msg["type"])
	assert.Equal(t, "rat-hunt", msg["quest"])
	assert.Equal(t, "kill-rats", msg["objective"])
	assert.EqualValues(t, 1, msg["count"])
	got, _ := inst.GetSlot(slot.ID)
	assert.Equal(t, 1, got.Quests["rat-hunt"].Objectives[0].Count)
	assert.Empty(t, rails.completed)
}

func TestApplyQuestEvents_CompletesAFinishedQuestWithNoTurnIn(t *testing.T) {
	inst, rails, slot, writeCh := progressInstance(t)
	kill := instance.QuestEventForTest{UnitID: slot.CharacterUnitID, Type: "kill", Unit: "rat-1", UnitType: "rat", Map: "yard"}
	inst.ApplyQuestEvents(context.Background(), []instance.QuestEventForTest{kill, kill, kill})

	assert.Equal(t, "quest-progress", nextMessage(t, writeCh)["type"])
	assert.Equal(t, "quest-progress", nextMessage(t, writeCh)["type"])
	done := nextMessage(t, writeCh)
	assert.Equal(t, "quest-completed", done["type"])
	assert.Equal(t, "rat-hunt", done["quest"])
	assert.Equal(t, []any{"quest/completed/rat-hunt"}, done["flags"])
	assert.Equal(t, []any{"Rat Tail"}, done["items"])
	assert.Equal(t, []string{"rat-hunt"}, rails.completed)
	got, _ := inst.GetSlot(slot.ID)
	assert.NotContains(t, got.Quests, "rat-hunt")
	assert.True(t, got.Flags["quest/completed/rat-hunt"])
}

func TestApplyQuestEvents_LeavesAFinishedTurnInQuestActive(t *testing.T) {
	inst, rails, slot, writeCh := progressInstance(t)
	inst.ApplyQuestEvents(context.Background(), []instance.QuestEventForTest{
		{UnitID: slot.CharacterUnitID, Type: "talk", NCU: "warden"},
		{UnitID: slot.CharacterUnitID, Type: "reach", Map: "cellar"},
	})

	assert.Equal(t, "talk-warden", nextMessage(t, writeCh)["objective"])
	assert.Equal(t, "reach-cellar", nextMessage(t, writeCh)["objective"])
	got, _ := inst.GetSlot(slot.ID)
	assert.True(t, got.Quests["deliver"].Ready())
	assert.Empty(t, rails.completed)
}

func TestApplyQuestEvents_IgnoresOtherZonesAndMaps(t *testing.T) {
	inst, rails, slot, _ := progressInstance(t)
	inst.ZoneIdentifier = "goblin-cave"
	inst.ApplyQuestEvents(context.Background(), []instance.QuestEventForTest{
		{UnitID: slot.CharacterUnitID, Type: "talk", NCU: "warden"},
	})
	assert.Empty(t, rails.timers)
	got, _ := inst.GetSlot(slot.ID)
	assert.Equal(t, 0, got.Quests["deliver"].Objectives[0].Count)
}

func TestTurnInQuest(t *testing.T) {
	inst, rails, slot, writeCh := progressInstance(t)
	ctx := context.Background()

	inst.TurnInQuest(ctx, slot.ID, "warden", "deliver")
	refused := nextMessage(t, writeCh)
	assert.Equal(t, "quest-turn-in-failed", refused["type"])
	assert.Contains(t, refused["error"], "isn't finished")

	inst.ApplyQuestEvents(ctx, []instance.QuestEventForTest{
		{UnitID: slot.CharacterUnitID, Type: "talk", NCU: "warden"},
		{UnitID: slot.CharacterUnitID, Type: "reach", Map: "cellar"},
	})
	nextMessage(t, writeCh)
	nextMessage(t, writeCh)

	inst.TurnInQuest(ctx, slot.ID, "grizzle", "deliver")
	wrongNCU := nextMessage(t, writeCh)
	assert.Equal(t, "quest-turn-in-failed", wrongNCU["type"])
	assert.Contains(t, wrongNCU["error"], "isn't turned in here")

	inst.TurnInQuest(ctx, slot.ID, "warden", "deliver")
	assert.Equal(t, "quest-completed", nextMessage(t, writeCh)["type"])
	assert.Equal(t, []string{"deliver"}, rails.completed)
}

func TestQuestTimers_SaveEvery15sAndFailOnExpiry(t *testing.T) {
	inst, rails, slot, writeCh := progressInstance(t)
	ctx := context.Background()
	start := time.Now()

	inst.TickQuestTimersForTest(ctx, start)
	inst.TickQuestTimersForTest(ctx, start.Add(15500*time.Millisecond))
	got, _ := inst.GetSlot(slot.ID)
	assert.Equal(t, 15, got.Quests["timed"].TimerElapsedSeconds)
	assert.Equal(t, 0, got.Quests["rat-hunt"].TimerElapsedSeconds, "untimed quests don't run")
	require.Eventually(t, func() bool {
		rails.mu.Lock()
		defer rails.mu.Unlock()
		return rails.timers["timed"] == 15
	}, time.Second, 10*time.Millisecond)

	inst.TickQuestTimersForTest(ctx, start.Add(20*time.Second))
	failed := nextMessage(t, writeCh)
	assert.Equal(t, "quest-failed", failed["type"])
	assert.Equal(t, "timed", failed["quest"])
	rails.mu.Lock()
	assert.Equal(t, []string{"timed"}, rails.abandoned)
	rails.mu.Unlock()
	got, _ = inst.GetSlot(slot.ID)
	assert.NotContains(t, got.Quests, "timed")
}

func TestSaveQuestTimers_SavesRunningTimers(t *testing.T) {
	inst, rails, slot, _ := progressInstance(t)
	start := time.Now()
	inst.TickQuestTimersForTest(context.Background(), start)
	inst.TickQuestTimersForTest(context.Background(), start.Add(7*time.Second))

	inst.SaveQuestTimers(context.Background(), slot.ID)
	assert.Equal(t, map[string]int{"timed": 7}, rails.timers)
}
