package command

import (
	"math"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// TalkRange is how many feet apart a player's and an NCU's token edges can
// be to talk (client/src/game/dialogue.js's TALK_RANGE).
const TalkRange = 10.0

// TalkHandler records that a player started a conversation with an NCU in
// range, for the tick loop to act on (see instance.processTalks).
type TalkHandler struct{}

func (TalkHandler) Type() string      { return "talk" }
func (TalkHandler) Deduplicate() bool { return false }

func (TalkHandler) Handle(unitID uuid.UUID, payload CommandPayload, _ instanceconfig.Zone, next *instancestate.InstanceState) error {
	p, ok := payload.(TalkPayload)
	if !ok {
		return nil
	}
	queueTalk(unitID, p.NCUID, "", next)
	return nil
}

// AcceptQuestHandler records a player accepting a quest from an NCU in
// range; the tick loop checks the offer and accepts it through Rails.
type AcceptQuestHandler struct{}

func (AcceptQuestHandler) Type() string      { return "accept_quest" }
func (AcceptQuestHandler) Deduplicate() bool { return false }

func (AcceptQuestHandler) Handle(unitID uuid.UUID, payload CommandPayload, _ instanceconfig.Zone, next *instancestate.InstanceState) error {
	p, ok := payload.(AcceptQuestPayload)
	if !ok || p.Quest == "" {
		return nil
	}
	queueTalk(unitID, p.NCUID, p.Quest, next)
	return nil
}

func queueTalk(unitID, ncuID uuid.UUID, quest string, next *instancestate.InstanceState) {
	unit, ok := next.Units[unitID]
	ncu, found := next.NCUs[ncuID]
	if !ok || !found || !InTalkRange(unit, ncu) {
		return
	}
	next.PendingTalks = append(next.PendingTalks, instancestate.Talk{
		UnitID:        unitID,
		NCUIdentifier: ncu.ZoneNCUIdentifier,
		AcceptQuest:   quest,
	})
}

// InTalkRange reports whether a living unit is close enough to talk to ncu.
func InTalkRange(unit *instancestate.UnitState, ncu *instancestate.NCUState) bool {
	if unit.Status == instancestate.UnitStatusDead || unit.Status == instancestate.UnitStatusRespawning {
		return false
	}
	if unit.MapIdentifier != ncu.MapIdentifier {
		return false
	}
	dist := math.Hypot(ncu.Position.X-unit.Position.X, ncu.Position.Y-unit.Position.Y)
	return dist <= TalkRange+unit.Radius+ncu.Radius
}
