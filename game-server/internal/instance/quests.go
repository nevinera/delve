package instance

import (
	"context"
	"errors"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// errNotOffered is a quest accept for a quest the NCU doesn't offer.
var errNotOffered = errors.New("that quest isn't offered here")

// errUnavailable is a quest accept the character doesn't qualify for.
var errUnavailable = errors.New("that quest isn't available")

// errNotActive is abandoning a quest the character isn't on.
var errNotActive = errors.New("that quest isn't active")

// questOffersMsg tells a player which quests each of the zone's NCUs
// offers them: NCU identifier → quest identifiers, in quests-file order.
type questOffersMsg struct {
	downBase
	Offers map[string][]string `json:"offers"`
}

type questAcceptedMsg struct {
	downBase
	Quest instanceconfig.ActiveQuest `json:"quest"`
}

type questAcceptFailedMsg struct {
	downBase
	Quest string `json:"quest"`
	Error string `json:"error"`
}

// questLogMsg is a player's active quests, with each objective's progress
// in the quest's objective order (resolved from Rails' per-hash counts
// against this version's definitions).
type questLogMsg struct {
	downBase
	Quests []questLogEntry `json:"quests"`
}

type questLogEntry struct {
	QuestIdentifier     string `json:"quest_identifier"`
	TimerElapsedSeconds int    `json:"timer_elapsed_seconds"`
	Objectives          []int  `json:"objectives"`
}

type questAbandonFailedMsg struct {
	downBase
	Quest string `json:"quest"`
	Error string `json:"error"`
}

func activeQuestsByIdentifier(quests []instanceconfig.ActiveQuest) map[string]instanceconfig.ActiveQuest {
	out := make(map[string]instanceconfig.ActiveQuest, len(quests))
	for _, quest := range quests {
		out[quest.QuestIdentifier] = quest
	}
	return out
}

// offeredHere returns the world's quests offered by an NCU in this zone.
func (inst *Instance) offeredHere() []instanceconfig.Quest {
	var out []instanceconfig.Quest
	for _, quest := range inst.Quests {
		if quest.OfferedBy.Zone == inst.ZoneIdentifier {
			out = append(out, quest)
		}
	}
	return out
}

// QuestOffers returns the quests each of the zone's NCUs offers the
// character in slotID: ones it isn't on, hasn't completed, and holds every
// required flag for. Empty for a slot with no world character. May call
// Rails (through HasFlag), so never from the tick loop.
func (inst *Instance) QuestOffers(slotID uuid.UUID) (map[string][]string, error) {
	slot, ok := inst.GetSlot(slotID)
	if !ok {
		return nil, errSlotGone
	}
	offers := map[string][]string{}
	if slot.WorldCharacterDatabaseID == "" {
		return offers, nil
	}
	for _, quest := range inst.offeredHere() {
		available, err := inst.questAvailable(slot, quest)
		if err != nil {
			return nil, err
		}
		if available {
			offers[quest.OfferedBy.NCU] = append(offers[quest.OfferedBy.NCU], quest.Identifier)
		}
	}
	return offers, nil
}

func (inst *Instance) questAvailable(slot *InstanceSlot, quest instanceconfig.Quest) (bool, error) {
	if _, active := slot.Quests[quest.Identifier]; active {
		return false, nil
	}
	completed, err := inst.HasFlag(slot.ID, quest.CompletionFlag())
	if err != nil || completed {
		return false, err
	}
	for _, flag := range quest.RequiresFlags {
		held, err := inst.HasFlag(slot.ID, flag)
		if err != nil || !held {
			return false, err
		}
	}
	return true, nil
}

// SendQuestOffers sends the character in slotID their quest offers,
// logging any failure. Sends nothing in a zone that offers no quests, or
// to a slot with no world character. Calls Rails, so run it in its own
// goroutine.
func (inst *Instance) SendQuestOffers(ctx context.Context, slotID uuid.UUID) {
	if len(inst.offeredHere()) == 0 {
		return
	}
	if slot, ok := inst.GetSlot(slotID); !ok || slot.WorldCharacterDatabaseID == "" {
		return
	}
	offers, err := inst.QuestOffers(slotID)
	if err != nil {
		if !errors.Is(err, errSlotGone) {
			slog.WarnContext(ctx, "failed to work out quest offers", "error", err, "zone", inst.ZoneIdentifier)
		}
		return
	}
	inst.sendJSONToSlot(slotID, questOffersMsg{downBase: inst.downBase("quest_offers"), Offers: offers})
}

// AcceptQuest accepts questIdentifier, offered by the zone's NCU
// ncuIdentifier, for the character in slotID, through Rails; then tells
// the player, and sends their new offers. Calls Rails, so run it in its
// own goroutine.
func (inst *Instance) AcceptQuest(ctx context.Context, slotID uuid.UUID, ncuIdentifier, questIdentifier string) {
	quest, err := inst.acceptQuest(slotID, ncuIdentifier, questIdentifier)
	if err != nil {
		if errors.Is(err, errSlotGone) {
			return
		}
		inst.sendJSONToSlot(slotID, questAcceptFailedMsg{downBase: inst.downBase("quest_accept_failed"), Quest: questIdentifier, Error: err.Error()})
		return
	}
	inst.sendJSONToSlot(slotID, questAcceptedMsg{downBase: inst.downBase("quest_accepted"), Quest: quest})
	inst.SendQuestLog(slotID)
	inst.SendQuestOffers(ctx, slotID)
}

// QuestLog returns the character in slotID's active quests, sorted by
// identifier, each objective's progress capped at what it requires.
func (inst *Instance) QuestLog(slotID uuid.UUID) ([]questLogEntry, bool) {
	slot, ok := inst.GetSlot(slotID)
	if !ok {
		return nil, false
	}
	definitions := make(map[string]instanceconfig.Quest, len(inst.Quests))
	for _, quest := range inst.Quests {
		definitions[quest.Identifier] = quest
	}
	entries := make([]questLogEntry, 0, len(slot.Quests))
	for _, active := range slot.Quests {
		objectives := definitions[active.QuestIdentifier].Objectives
		counts := make([]int, len(objectives))
		for i, objective := range objectives {
			counts[i] = min(active.Progress[objective.Hash()], objective.Required())
		}
		entries = append(entries, questLogEntry{
			QuestIdentifier:     active.QuestIdentifier,
			TimerElapsedSeconds: active.TimerElapsedSeconds,
			Objectives:          counts,
		})
	}
	slices.SortFunc(entries, func(a, b questLogEntry) int { return strings.Compare(a.QuestIdentifier, b.QuestIdentifier) })
	return entries, true
}

// SendQuestLog sends the character in slotID their quest log. Sends
// nothing to a slot with no world character.
func (inst *Instance) SendQuestLog(slotID uuid.UUID) {
	if slot, ok := inst.GetSlot(slotID); !ok || slot.WorldCharacterDatabaseID == "" {
		return
	}
	entries, ok := inst.QuestLog(slotID)
	if !ok {
		return
	}
	inst.sendJSONToSlot(slotID, questLogMsg{downBase: inst.downBase("quest_log"), Quests: entries})
}

// AbandonQuest ends the character in slotID's active quest through Rails,
// then sends their new quest log and offers (or quest_abandon_failed).
// Calls Rails, so run it in its own goroutine.
func (inst *Instance) AbandonQuest(ctx context.Context, slotID uuid.UUID, questIdentifier string) {
	if err := inst.abandonQuest(slotID, questIdentifier); err != nil {
		if !errors.Is(err, errSlotGone) {
			inst.sendJSONToSlot(slotID, questAbandonFailedMsg{downBase: inst.downBase("quest_abandon_failed"), Quest: questIdentifier, Error: err.Error()})
		}
		return
	}
	inst.SendQuestLog(slotID)
	inst.SendQuestOffers(ctx, slotID)
}

func (inst *Instance) abandonQuest(slotID uuid.UUID, questIdentifier string) error {
	slot, ok := inst.GetSlot(slotID)
	if !ok {
		return errSlotGone
	}
	if slot.WorldCharacterDatabaseID == "" {
		return ErrNoWorldCharacter
	}
	if _, active := slot.Quests[questIdentifier]; !active {
		return errNotActive
	}
	if inst.RailsClient == nil {
		return ErrNoRailsClient
	}
	if err := inst.RailsClient.AbandonQuest(slot.WorldCharacterDatabaseID, questIdentifier); err != nil {
		return err
	}
	inst.removeActiveQuest(slotID, questIdentifier)
	return nil
}

// removeActiveQuest drops an active quest from the slot. A no-op if the
// slot is gone.
func (inst *Instance) removeActiveQuest(slotID uuid.UUID, questIdentifier string) {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	if slot, ok := inst.slots[slotID]; ok {
		delete(slot.Quests, questIdentifier)
	}
}

func (inst *Instance) acceptQuest(slotID uuid.UUID, ncuIdentifier, questIdentifier string) (instanceconfig.ActiveQuest, error) {
	var none instanceconfig.ActiveQuest
	quest, ok := inst.questOfferedBy(ncuIdentifier, questIdentifier)
	if !ok {
		return none, errNotOffered
	}
	slot, ok := inst.GetSlot(slotID)
	if !ok {
		return none, errSlotGone
	}
	if slot.WorldCharacterDatabaseID == "" {
		return none, ErrNoWorldCharacter
	}
	available, err := inst.questAvailable(slot, quest)
	if err != nil {
		return none, err
	}
	if !available {
		return none, errUnavailable
	}
	if inst.RailsClient == nil {
		return none, ErrNoRailsClient
	}
	active, err := inst.RailsClient.AcceptQuest(slot.WorldCharacterDatabaseID, questIdentifier)
	if err != nil {
		return none, err
	}
	inst.setActiveQuest(slotID, active)
	return active, nil
}

func (inst *Instance) questOfferedBy(ncuIdentifier, questIdentifier string) (instanceconfig.Quest, bool) {
	for _, quest := range inst.offeredHere() {
		if quest.Identifier == questIdentifier && quest.OfferedBy.NCU == ncuIdentifier {
			return quest, true
		}
	}
	return instanceconfig.Quest{}, false
}

// setActiveQuest records an active quest on the slot. A no-op if the slot
// is gone.
func (inst *Instance) setActiveQuest(slotID uuid.UUID, quest instanceconfig.ActiveQuest) {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	slot, ok := inst.slots[slotID]
	if !ok {
		return
	}
	if slot.Quests == nil {
		slot.Quests = make(map[string]instanceconfig.ActiveQuest)
	}
	slot.Quests[quest.QuestIdentifier] = quest
}

// processTalks acts on each conversation started this tick (refreshing the
// player's offers) and each quest accepted, off the tick loop.
func (inst *Instance) processTalks(ctx context.Context, talks []instancestate.Talk) {
	for _, talk := range talks {
		slot := inst.slotByUnitID(talk.UnitID)
		if slot == nil {
			continue
		}
		if talk.AcceptQuest != "" {
			go inst.AcceptQuest(ctx, slot.ID, talk.NCUIdentifier, talk.AcceptQuest)
		} else {
			go inst.SendQuestOffers(ctx, slot.ID)
		}
	}
}

func (inst *Instance) downBase(msgType string) downBase {
	return downBase{Direction: "down", Type: msgType, Timestamp: time.Now().UnixMilli()}
}
