package instance

import (
	"context"
	"errors"
	"log/slog"
	"maps"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// QuestTimerPersistEvery is how often a running quest timer is saved to
// Rails (it's also saved when the player disconnects).
const QuestTimerPersistEvery = 15

// errNotReady is turning in a quest whose objectives aren't all met.
var errNotReady = errors.New("that quest isn't finished yet")

// errNotTurnedInHere is turning in a quest to an NCU that doesn't take it.
var errNotTurnedInHere = errors.New("that quest isn't turned in here")

// questEvent is something a player did that can meet an objective: talked
// to an NCU, killed a unit (one they tagged), or reached a map.
type questEvent struct {
	UnitID   uuid.UUID // the player's unit
	Type     string    // "talk", "kill" or "reach", as objective types
	NCU      string
	Unit     string
	UnitType string
	Map      string
}

// questProgressMsg is quest-progress: one objective's new count.
type questProgressMsg struct {
	downBase
	Quest     string `json:"quest"`
	Objective string `json:"objective"` // its hash
	Count     int    `json:"count"`
}

// questCompletedMsg is quest-completed: what completing it granted.
type questCompletedMsg struct {
	downBase
	Quest string   `json:"quest"`
	Flags []string `json:"flags"`
	Items []string `json:"items"` // names of the items newly held
}

func (inst *Instance) matches(objective instanceconfig.QuestObjective, event questEvent) bool {
	if objective.Type != event.Type || objective.Zone != inst.ZoneIdentifier {
		return false
	}
	switch event.Type {
	case "talk":
		return objective.NCU == event.NCU
	case "reach":
		return objective.Map == event.Map
	case "kill":
		if objective.Map != "" && objective.Map != event.Map {
			return false
		}
		if objective.Unit != "" {
			return objective.Unit == event.Unit
		}
		return objective.UnitType == event.UnitType
	}
	return false
}

// collectQuestEvents finds this tick's quest events: conversations started,
// kills (credited to everyone who can loot them), and players arriving on
// a map (including spawning). Tick loop only.
func (inst *Instance) collectQuestEvents(prev, curr *instancestate.InstanceState) []questEvent {
	if len(inst.Quests) == 0 {
		return nil
	}
	var events []questEvent
	for _, talk := range curr.PendingTalks {
		if talk.AcceptQuest == "" && talk.TurnInQuest == "" {
			events = append(events, questEvent{UnitID: talk.UnitID, Type: "talk", NCU: talk.NCUIdentifier})
		}
	}
	for id, unit := range curr.Units {
		before := prev.Units[id]
		if strings.HasPrefix(unit.ZoneUnitIdentifier, "player:") {
			if before == nil || before.MapIdentifier != unit.MapIdentifier {
				events = append(events, questEvent{UnitID: id, Type: "reach", Map: unit.MapIdentifier})
			}
			continue
		}
		justDied := unit.Status == instancestate.UnitStatusDead && (before == nil || before.Status != instancestate.UnitStatusDead)
		if !justDied {
			continue
		}
		for _, player := range killCredited(unit) {
			events = append(events, questEvent{
				UnitID: player, Type: "kill",
				Unit: unit.ZoneUnitIdentifier, UnitType: unit.UnitTypeIdentifier, Map: unit.MapIdentifier,
			})
		}
	}
	return events
}

// ApplyQuestEvents advances the objectives each event meets, through Rails,
// sending quest-progress for each; a quest that's then finished and has no
// turn-in NCU completes. Calls Rails, so run it in its own goroutine.
func (inst *Instance) ApplyQuestEvents(ctx context.Context, events []questEvent) {
	inst.questMu.Lock()
	defer inst.questMu.Unlock()
	for _, event := range events {
		slot := inst.slotByUnitID(event.UnitID)
		if slot == nil || slot.WorldCharacterDatabaseID == "" || inst.RailsClient == nil {
			continue
		}
		for _, id := range slices.Sorted(maps.Keys(slot.Quests)) {
			if err := inst.advanceQuest(ctx, slot.ID, slot.WorldCharacterDatabaseID, slot.Quests[id], event); err != nil {
				slog.WarnContext(ctx, "failed to record quest progress", "error", err, "quest", id)
			}
		}
	}
}

func (inst *Instance) advanceQuest(ctx context.Context, slotID uuid.UUID, worldCharacterID string, active instanceconfig.ActiveQuest, event questEvent) error {
	progress := map[string]int{}
	for _, objective := range active.Objectives {
		if objective.Count < objective.Required && inst.matches(objective.Objective, event) {
			progress[objective.Hash] = objective.Count + 1
		}
	}
	if len(progress) == 0 {
		return nil
	}
	updated, err := inst.RailsClient.QuestProgress(worldCharacterID, active.QuestIdentifier, progress, nil)
	if err != nil {
		return err
	}
	inst.setActiveQuest(slotID, updated)
	for _, hash := range slices.Sorted(maps.Keys(progress)) {
		inst.sendJSONToSlot(slotID, questProgressMsg{
			downBase: inst.downBase("quest-progress"), Quest: active.QuestIdentifier, Objective: hash, Count: progress[hash],
		})
	}
	if quest, ok := inst.quest(active.QuestIdentifier); ok && quest.TurnIn == nil && updated.Ready() {
		return inst.completeQuest(ctx, slotID, worldCharacterID, active.QuestIdentifier)
	}
	return nil
}

// TurnInQuest completes the character in slotID's finished quest at its
// turn-in NCU (ncuIdentifier, which the player is talking to), or sends
// quest-turn-in-failed. Calls Rails, so run it in its own goroutine.
func (inst *Instance) TurnInQuest(ctx context.Context, slotID uuid.UUID, ncuIdentifier, questIdentifier string) {
	inst.questMu.Lock()
	defer inst.questMu.Unlock()
	err := inst.turnInQuest(ctx, slotID, ncuIdentifier, questIdentifier)
	if err != nil && !errors.Is(err, errSlotGone) {
		inst.sendJSONToSlot(slotID, questFailedMsg{downBase: inst.downBase("quest-turn-in-failed"), Quest: questIdentifier, Error: err.Error()})
	}
}

func (inst *Instance) turnInQuest(ctx context.Context, slotID uuid.UUID, ncuIdentifier, questIdentifier string) error {
	slot, ok := inst.GetSlot(slotID)
	if !ok {
		return errSlotGone
	}
	active, ok := slot.Quests[questIdentifier]
	if !ok {
		return errNotActive
	}
	quest, ok := inst.quest(questIdentifier)
	if !ok || quest.TurnIn == nil || quest.TurnIn.Zone != inst.ZoneIdentifier || quest.TurnIn.NCU != ncuIdentifier {
		return errNotTurnedInHere
	}
	if !active.Ready() {
		return errNotReady
	}
	if inst.RailsClient == nil {
		return ErrNoRailsClient
	}
	return inst.completeQuest(ctx, slotID, slot.WorldCharacterDatabaseID, questIdentifier)
}

// completeQuest completes a quest through Rails (which grants its flags
// and rewards), caches the flags, and sends quest-completed and new
// offers. Must hold questMu.
func (inst *Instance) completeQuest(ctx context.Context, slotID uuid.UUID, worldCharacterID, questIdentifier string) error {
	done, err := inst.RailsClient.CompleteQuest(worldCharacterID, questIdentifier)
	if err != nil {
		return err
	}
	for _, flag := range done.Flags {
		inst.cacheFlag(slotID, flag, true)
	}
	inst.removeActiveQuest(slotID, questIdentifier)
	items := make([]string, len(done.Items))
	for i, item := range done.Items {
		items[i] = item.Name
	}
	inst.sendJSONToSlot(slotID, questCompletedMsg{downBase: inst.downBase("quest-completed"), Quest: questIdentifier, Flags: done.Flags, Items: items})
	inst.SendQuestOffers(ctx, slotID)
	return nil
}

// questTimer is a timed quest whose timer needs saving, or that ran out.
type questTimer struct {
	slotID           uuid.UUID
	worldCharacterID string
	quest            string
	elapsed          int
}

// tickQuestTimers advances the timers of connected players' timed quests by
// each whole second passed, saving them every QuestTimerPersistEvery
// seconds and failing quests that run out (off the tick loop). Tick loop
// only.
func (inst *Instance) tickQuestTimers(ctx context.Context, now time.Time) {
	if len(inst.Quests) == 0 {
		return
	}
	if inst.questTimerAt.IsZero() {
		inst.questTimerAt = now
		return
	}
	seconds := int(now.Sub(inst.questTimerAt) / time.Second)
	if seconds < 1 {
		return
	}
	inst.questTimerAt = inst.questTimerAt.Add(time.Duration(seconds) * time.Second)
	limits := inst.questTimerLimits()
	if len(limits) == 0 {
		return
	}
	persist, expired := inst.advanceQuestTimers(limits, seconds)
	if len(persist) > 0 || len(expired) > 0 {
		go inst.handleQuestTimers(ctx, persist, expired)
	}
}

func (inst *Instance) questTimerLimits() map[string]int {
	limits := map[string]int{}
	for _, quest := range inst.Quests {
		if seconds := quest.TimerSeconds(); seconds > 0 {
			limits[quest.Identifier] = seconds
		}
	}
	return limits
}

func (inst *Instance) advanceQuestTimers(limits map[string]int, seconds int) (persist, expired []questTimer) {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	for _, slot := range inst.slots {
		if slot.State != SlotStateConnected || slot.WorldCharacterDatabaseID == "" {
			continue
		}
		for id, active := range slot.Quests {
			limit, timed := limits[id]
			if !timed {
				continue
			}
			before := active.TimerElapsedSeconds
			active.TimerElapsedSeconds = min(before+seconds, limit)
			slot.Quests[id] = active
			timer := questTimer{slotID: slot.ID, worldCharacterID: slot.WorldCharacterDatabaseID, quest: id, elapsed: active.TimerElapsedSeconds}
			switch {
			case active.TimerElapsedSeconds >= limit:
				expired = append(expired, timer)
			case before/QuestTimerPersistEvery != active.TimerElapsedSeconds/QuestTimerPersistEvery:
				persist = append(persist, timer)
			}
		}
	}
	return persist, expired
}

// handleQuestTimers saves running timers and fails expired quests
// (quest-failed), through Rails. Calls Rails, so run it in its own
// goroutine.
func (inst *Instance) handleQuestTimers(ctx context.Context, persist, expired []questTimer) {
	inst.questMu.Lock()
	defer inst.questMu.Unlock()
	if inst.RailsClient == nil {
		return
	}
	for _, timer := range persist {
		inst.saveQuestTimer(ctx, timer)
	}
	for _, timer := range expired {
		if !inst.questActive(timer.slotID, timer.quest) {
			continue
		}
		if err := inst.RailsClient.AbandonQuest(timer.worldCharacterID, timer.quest); err != nil {
			slog.WarnContext(ctx, "failed to fail an expired quest", "error", err, "quest", timer.quest)
			continue
		}
		inst.removeActiveQuest(timer.slotID, timer.quest)
		inst.sendJSONToSlot(timer.slotID, questEndedMsg{downBase: inst.downBase("quest-failed"), Quest: timer.quest})
		inst.SendQuestOffers(ctx, timer.slotID)
	}
}

// SaveQuestTimers saves the character in slotID's running quest timers to
// Rails, for when they disconnect. Calls Rails, so run it in its own
// goroutine.
func (inst *Instance) SaveQuestTimers(ctx context.Context, slotID uuid.UUID) {
	slot, ok := inst.GetSlot(slotID)
	if !ok || slot.WorldCharacterDatabaseID == "" || inst.RailsClient == nil {
		return
	}
	limits := inst.questTimerLimits()
	inst.questMu.Lock()
	defer inst.questMu.Unlock()
	for id, active := range slot.Quests {
		if _, timed := limits[id]; timed {
			inst.saveQuestTimer(ctx, questTimer{slotID: slotID, worldCharacterID: slot.WorldCharacterDatabaseID, quest: id, elapsed: active.TimerElapsedSeconds})
		}
	}
}

func (inst *Instance) saveQuestTimer(ctx context.Context, timer questTimer) {
	if !inst.questActive(timer.slotID, timer.quest) {
		return
	}
	if _, err := inst.RailsClient.QuestProgress(timer.worldCharacterID, timer.quest, map[string]int{}, &timer.elapsed); err != nil {
		slog.WarnContext(ctx, "failed to save quest timer", "error", err, "quest", timer.quest)
	}
}

func (inst *Instance) questActive(slotID uuid.UUID, questIdentifier string) bool {
	slot, ok := inst.GetSlot(slotID)
	if !ok {
		return false
	}
	_, active := slot.Quests[questIdentifier]
	return active
}
