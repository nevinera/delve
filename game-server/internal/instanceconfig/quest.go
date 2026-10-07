package instanceconfig

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
)

// Quest is one quest in a world's quests file (docs/schema/quest.md). Rails
// validates the file at import; the game server only reads it.
type Quest struct {
	Identifier      string           `json:"identifier"`
	Name            string           `json:"name"`
	ChainIdentifier string           `json:"chainIdentifier"`
	ChainName       string           `json:"chainName"`
	OfferedBy       NcuRef           `json:"offeredBy"`
	TurnIn          *NcuRef          `json:"turnIn,omitempty"`
	RequiresFlags   []string         `json:"requiresFlags,omitempty"`
	GrantsFlags     []string         `json:"grantsFlags,omitempty"`
	Timer           string           `json:"timer,omitempty"`
	Objectives      []QuestObjective `json:"objectives,omitempty"`
	Rewards         []QuestReward    `json:"rewards,omitempty"`
	// The quest's texts (description, offerText, progressText,
	// completionText) are client-only.
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
// Rails stores it: progress is a count per objective hash.
type ActiveQuest struct {
	QuestIdentifier     string         `json:"quest_identifier"`
	TimerElapsedSeconds int            `json:"timer_elapsed_seconds"`
	Progress            map[string]int `json:"progress"`
}

// Hash identifies the objective across world versions, matching Rails'
// QuestObjective.hash_of: the SHA1 of its JSON with only these fields, in
// this order, leaving out blanks and the default count of 1. Progress is
// kept per hash (see docs/quests.md#world-versions).
func (o QuestObjective) Hash() string {
	type hashed struct {
		Type     string `json:"type,omitempty"`
		Zone     string `json:"zone,omitempty"`
		NCU      string `json:"ncu,omitempty"`
		Unit     string `json:"unit,omitempty"`
		UnitType string `json:"unitType,omitempty"`
		Count    int    `json:"count,omitempty"`
		Map      string `json:"map,omitempty"`
	}
	h := hashed(o)
	if h.Count == 1 {
		h.Count = 0
	}
	data, _ := json.Marshal(h) // can't fail: strings and an int
	sum := sha1.Sum(data)
	return hex.EncodeToString(sum[:])
}

// Required is how many times the objective must be met: its count, or 1.
func (o QuestObjective) Required() int {
	if o.Count < 1 {
		return 1
	}
	return o.Count
}
