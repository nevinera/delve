package command_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func talkState(playerX float64, status instancestate.UnitStatus, playerMap string) (*instancestate.InstanceState, uuid.UUID, uuid.UUID) {
	unitID, ncuID := uuid.New(), uuid.New()
	return &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{unitID: {
			MapIdentifier: playerMap, Position: instanceconfig.Position{X: playerX}, Radius: 1, Status: status,
		}},
		NCUs: map[uuid.UUID]*instancestate.NCUState{ncuID: {
			ZoneNCUIdentifier: "grizzle", MapIdentifier: "camp", Radius: 2,
		}},
	}, unitID, ncuID
}

func TestTalkHandler_QueuesATalkInRange(t *testing.T) {
	state, unitID, ncuID := talkState(13, instancestate.UnitStatusIdle, "camp") // 10 + 1 + 2 feet away
	_ = command.TalkHandler{}.Handle(unitID, command.TalkPayload{NCUID: ncuID}, instanceconfig.Zone{}, state)
	assert.Equal(t, []instancestate.Talk{{UnitID: unitID, NCUIdentifier: "grizzle"}}, state.PendingTalks)
}

func TestTalkHandler_IgnoresTalksOutOfReach(t *testing.T) {
	for name, state := range map[string]func() (*instancestate.InstanceState, uuid.UUID, uuid.UUID){
		"too far": func() (*instancestate.InstanceState, uuid.UUID, uuid.UUID) {
			return talkState(13.1, instancestate.UnitStatusIdle, "camp")
		},
		"another map": func() (*instancestate.InstanceState, uuid.UUID, uuid.UUID) {
			return talkState(0, instancestate.UnitStatusIdle, "cave")
		},
		"dead": func() (*instancestate.InstanceState, uuid.UUID, uuid.UUID) {
			return talkState(0, instancestate.UnitStatusDead, "camp")
		},
		"respawning": func() (*instancestate.InstanceState, uuid.UUID, uuid.UUID) {
			return talkState(0, instancestate.UnitStatusRespawning, "camp")
		},
	} {
		t.Run(name, func(t *testing.T) {
			s, unitID, ncuID := state()
			_ = command.TalkHandler{}.Handle(unitID, command.TalkPayload{NCUID: ncuID}, instanceconfig.Zone{}, s)
			assert.Empty(t, s.PendingTalks)
		})
	}
}

func TestTalkHandler_IgnoresAnUnknownNCU(t *testing.T) {
	state, unitID, _ := talkState(0, instancestate.UnitStatusIdle, "camp")
	_ = command.TalkHandler{}.Handle(unitID, command.TalkPayload{NCUID: uuid.New()}, instanceconfig.Zone{}, state)
	assert.Empty(t, state.PendingTalks)
}

func TestAcceptQuestHandler_QueuesTheQuest(t *testing.T) {
	state, unitID, ncuID := talkState(0, instancestate.UnitStatusIdle, "camp")
	_ = command.AcceptQuestHandler{}.Handle(unitID, command.AcceptQuestPayload{NCUID: ncuID, Quest: "rat-hunt"}, instanceconfig.Zone{}, state)
	assert.Equal(t, []instancestate.Talk{{UnitID: unitID, NCUIdentifier: "grizzle", AcceptQuest: "rat-hunt"}}, state.PendingTalks)
}
