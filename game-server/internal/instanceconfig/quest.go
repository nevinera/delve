package instanceconfig

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
