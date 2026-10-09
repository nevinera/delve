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
	queueTalk(unitID, p.NCUID, instancestate.Talk{}, next)
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
	queueTalk(unitID, p.NCUID, instancestate.Talk{AcceptQuest: p.Quest}, next)
	return nil
}

// TurnInQuestHandler records a player turning a quest in to an NCU in
// range; the tick loop checks it's finished and completes it through Rails.
type TurnInQuestHandler struct{}

func (TurnInQuestHandler) Type() string      { return "turn_in_quest" }
func (TurnInQuestHandler) Deduplicate() bool { return false }

func (TurnInQuestHandler) Handle(unitID uuid.UUID, payload CommandPayload, _ instanceconfig.Zone, next *instancestate.InstanceState) error {
	p, ok := payload.(TurnInQuestPayload)
	if !ok || p.Quest == "" {
		return nil
	}
	queueTalk(unitID, p.NCUID, instancestate.Talk{TurnInQuest: p.Quest}, next)
	return nil
}

// queueTalk queues talk (with its unit and NCU filled in) if the unit is in
// range of the NCU.
func queueTalk(unitID, ncuID uuid.UUID, talk instancestate.Talk, next *instancestate.InstanceState) {
	unit, ok := next.Units[unitID]
	ncu, found := next.NCUs[ncuID]
	if !ok || !found || !InTalkRange(unit, ncu) {
		return
	}
	talk.UnitID = unitID
	talk.NCUIdentifier = ncu.ZoneNCUIdentifier
	talk.Map = unit.MapIdentifier
	next.PendingTalks = append(next.PendingTalks, talk)
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
