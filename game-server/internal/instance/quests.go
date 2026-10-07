package instance

import (
	"context"
	"errors"
	"log/slog"
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

// The client keeps its own quest log (read from Rails on load); the
// server sends it events as quests change.

// questOffersMsg tells a player which quests each of the zone's NCUs
// offers them: NCU identifier → quest identifiers, in quests-file order.
type questOffersMsg struct {
	downBase
	Offers map[string][]string `json:"offers"`
}

// questMsg carries an active quest as Rails stores it: quest-received
// (accepted) and quest-updated (moved to a newer definition).
type questMsg struct {
	downBase
	Quest instanceconfig.ActiveQuest `json:"quest"`
}

// questEndedMsg is quest-abandoned.
type questEndedMsg struct {
	downBase
	Quest string `json:"quest"`
}

// questFailedMsg is quest-accept-failed or quest-abandon-failed.
type questFailedMsg struct {
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

// quest returns the world's quest with this identifier.
func (inst *Instance) quest(identifier string) (instanceconfig.Quest, bool) {
	for _, quest := range inst.Quests {
		if quest.Identifier == identifier {
			return quest, true
		}
	}
	return instanceconfig.Quest{}, false
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
	if len(inst.offeredHere()) == 0 || !inst.hasWorldCharacter(slotID) {
		return
	}
	offers, err := inst.QuestOffers(slotID)
	if err != nil {
		if !errors.Is(err, errSlotGone) {
			slog.WarnContext(ctx, "failed to work out quest offers", "error", err, "zone", inst.ZoneIdentifier)
		}
		return
	}
	inst.sendJSONToSlot(slotID, questOffersMsg{downBase: inst.downBase("quest-offers"), Offers: offers})
}

// UpgradeQuests moves the character in slotID's active quests from older
// world versions onto this instance's, through Rails: a quest this version
// still has is synced to its definition here (quest-updated), and one it
// doesn't is abandoned (quest-abandoned). Logs any failure. Calls Rails,
// so run it in its own goroutine.
func (inst *Instance) UpgradeQuests(ctx context.Context, slotID uuid.UUID) {
	slot, ok := inst.GetSlot(slotID)
	if !ok || slot.WorldCharacterDatabaseID == "" || inst.RailsClient == nil {
		return
	}
	for _, active := range slot.Quests {
		if active.WorldVersionID == inst.WorldVersionID {
			continue
		}
		if err := inst.upgradeQuest(slotID, slot.WorldCharacterDatabaseID, active.QuestIdentifier); err != nil {
			slog.WarnContext(ctx, "failed to upgrade quest", "error", err, "quest", active.QuestIdentifier)
		}
	}
}

func (inst *Instance) upgradeQuest(slotID uuid.UUID, worldCharacterID, questIdentifier string) error {
	quest, ok := inst.quest(questIdentifier)
	if !ok {
		if err := inst.RailsClient.AbandonQuest(worldCharacterID, questIdentifier); err != nil {
			return err
		}
		inst.removeActiveQuest(slotID, questIdentifier)
		inst.sendJSONToSlot(slotID, questEndedMsg{downBase: inst.downBase("quest-abandoned"), Quest: questIdentifier})
		return nil
	}
	active, err := inst.RailsClient.SyncQuest(worldCharacterID, quest)
	if err != nil {
		return err
	}
	inst.setActiveQuest(slotID, active)
	inst.sendJSONToSlot(slotID, questMsg{downBase: inst.downBase("quest-updated"), Quest: active})
	return nil
}

// AcceptQuest accepts questIdentifier, offered by the zone's NCU
// ncuIdentifier, for the character in slotID, through Rails; then sends
// quest-received and their new offers (or quest-accept-failed). Calls
// Rails, so run it in its own goroutine.
func (inst *Instance) AcceptQuest(ctx context.Context, slotID uuid.UUID, ncuIdentifier, questIdentifier string) {
	quest, err := inst.acceptQuest(slotID, ncuIdentifier, questIdentifier)
	if err != nil {
		if !errors.Is(err, errSlotGone) {
			inst.sendJSONToSlot(slotID, questFailedMsg{downBase: inst.downBase("quest-accept-failed"), Quest: questIdentifier, Error: err.Error()})
		}
		return
	}
	inst.sendJSONToSlot(slotID, questMsg{downBase: inst.downBase("quest-received"), Quest: quest})
	inst.SendQuestOffers(ctx, slotID)
}

func (inst *Instance) acceptQuest(slotID uuid.UUID, ncuIdentifier, questIdentifier string) (instanceconfig.ActiveQuest, error) {
	var none instanceconfig.ActiveQuest
	quest, ok := inst.quest(questIdentifier)
	if !ok || quest.OfferedBy.Zone != inst.ZoneIdentifier || quest.OfferedBy.NCU != ncuIdentifier {
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
	active, err := inst.RailsClient.AcceptQuest(slot.WorldCharacterDatabaseID, quest)
	if err != nil {
		return none, err
	}
	inst.setActiveQuest(slotID, active)
	return active, nil
}

// AbandonQuest ends the character in slotID's active quest through Rails,
// then sends quest-abandoned and their new offers (or
// quest-abandon-failed). Calls Rails, so run it in its own goroutine.
func (inst *Instance) AbandonQuest(ctx context.Context, slotID uuid.UUID, questIdentifier string) {
	if err := inst.abandonQuest(slotID, questIdentifier); err != nil {
		if !errors.Is(err, errSlotGone) {
			inst.sendJSONToSlot(slotID, questFailedMsg{downBase: inst.downBase("quest-abandon-failed"), Quest: questIdentifier, Error: err.Error()})
		}
		return
	}
	inst.sendJSONToSlot(slotID, questEndedMsg{downBase: inst.downBase("quest-abandoned"), Quest: questIdentifier})
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

func (inst *Instance) hasWorldCharacter(slotID uuid.UUID) bool {
	slot, ok := inst.GetSlot(slotID)
	return ok && slot.WorldCharacterDatabaseID != ""
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

// removeActiveQuest drops an active quest from the slot. A no-op if the
// slot is gone.
func (inst *Instance) removeActiveQuest(slotID uuid.UUID, questIdentifier string) {
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	if slot, ok := inst.slots[slotID]; ok {
		delete(slot.Quests, questIdentifier)
	}
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
