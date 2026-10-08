package instanceconfig

import (
	"encoding/json"
	"strconv"
)

// Quest is one quest in a world's quests file (docs/schema/quest.md). Rails
// validates the file at import; the game server only reads it.
type Quest struct {
	Identifier      string           `json:"identifier"`
	ChainIdentifier string           `json:"chainIdentifier"`
	OfferedBy       NcuRef           `json:"offeredBy"`
	TurnIn          *NcuRef          `json:"turnIn,omitempty"`
	RequiresFlags   []string         `json:"requiresFlags,omitempty"`
	GrantsFlags     []string         `json:"grantsFlags,omitempty"`
	Timer           string           `json:"timer,omitempty"`
	Objectives      []QuestObjective `json:"objectives,omitempty"`
	Rewards         []QuestReward    `json:"rewards,omitempty"`
	// The quest's prose (name, chainName, description, offerText,
	// progressText, completionText) is client-only.
}

// NcuRef names an NCU in one of the world's zones.
type NcuRef struct {
	Zone string `json:"zone"`
	NCU  string `json:"ncu"`
}

// QuestObjective is one of a quest's objectives; which fields apply
// depends on Type (talk, kill, reach).
type QuestObjective struct {
	Type     string `json:"type"`
	Text     string `json:"text"` // for the quest log; not part of its hash
	Zone     string `json:"zone"`
	NCU      string `json:"ncu,omitempty"`
	Unit     string `json:"unit,omitempty"`
	UnitType string `json:"unitType,omitempty"`
	Count    int    `json:"count,omitempty"`
	Map      string `json:"map,omitempty"`
}

// QuestReward is an item granted on completing a quest.
type QuestReward struct {
	Zone string `json:"zone"`
	Item string `json:"item"`
}

// CompletionFlag is the flag completing the quest grants.
func (q Quest) CompletionFlag() string { return "quest/completed/" + q.Identifier }

// ActiveQuest is a quest a character has accepted and not finished, as
// Rails stores it: the structure of the definition it was accepted (or
// last synced) under, from WorldVersionID, and each objective's progress
// in order.
type ActiveQuest struct {
	QuestIdentifier     string            `json:"quest_identifier"`
	WorldVersionID      string            `json:"world_version_id"`
	TimerElapsedSeconds int               `json:"timer_elapsed_seconds"`
	Definition          json.RawMessage   `json:"definition"`
	Objectives          []ActiveObjective `json:"objectives"`
}

// ActiveObjective is one objective of an active quest: its definition,
// Rails' hash of it (which identifies it across versions), and progress.
type ActiveObjective struct {
	Hash      string         `json:"hash"`
	Objective QuestObjective `json:"objective"`
	Count     int            `json:"count"`
	Required  int            `json:"required"`
}

// TimerSeconds is the quest's time limit in seconds ("90s", "5m"), or 0
// for none (or a malformed one; Rails validates them at import).
func (q Quest) TimerSeconds() int {
	if len(q.Timer) < 2 {
		return 0
	}
	n, err := strconv.Atoi(q.Timer[:len(q.Timer)-1])
	if err != nil || n < 1 {
		return 0
	}
	switch q.Timer[len(q.Timer)-1] {
	case 's':
		return n
	case 'm':
		return n * 60
	default:
		return 0
	}
}

// Ready reports whether every objective is met.
func (q ActiveQuest) Ready() bool {
	for _, objective := range q.Objectives {
		if objective.Count < objective.Required {
			return false
		}
	}
	return true
}
