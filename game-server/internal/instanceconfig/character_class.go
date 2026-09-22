package instanceconfig

import (
	"bytes"
	"encoding/json"
	"errors"
)

// CharacterClass defines the abilities and appearance of a player character.
// The game server always receives fully-resolved configs — all AssetReferences
// must be inlined before delivery. graphicEffects and soundEffects on powers
// are client-only and omitted.
type CharacterClass struct {
	Name           string         `json:"name"`
	Description    string         `json:"description,omitempty"`
	Colors         Colors         `json:"colors"`
	Resources      []ResourceType `json:"resources,omitempty"`
	Powers         []Power        `json:"powers,omitempty"`
	PrimaryStats   []string       `json:"primaryStats"`
	SecondaryStats []string       `json:"secondaryStats"`
	Wields         []string       `json:"wields"`
}

func (c *CharacterClass) UnmarshalJSON(data []byte) error {
	if bytes.Contains(data, []byte(`"$ref"`)) {
		return errors.New(
			`character class config contains an unresolved AssetReference ("$ref"); ` +
				`the Rails app must send a fully-resolved concrete config`,
		)
	}
	type plain CharacterClass
	return json.Unmarshal(data, (*plain)(c))
}

// PrimaryResource returns the one entry in Resources whose DisplayType is
// "primary" - the resource that's displayed, regenerated, and spent by
// ability costs (docs/schema/character_class.md requires exactly one).
// Returns the zero ResourceType if none is marked (e.g. an incompletely
// authored class reaching the game server outside Rails validation).
func (c CharacterClass) PrimaryResource() ResourceType {
	for _, r := range c.Resources {
		if r.DisplayType == "primary" {
			return r
		}
	}
	return ResourceType{}
}

// DamageStatKey returns whichever of "strength"/"agility"/"intellect" is
// this class's designated basic-attack damage stat - the first one listed in
// PrimaryStats (docs/stats.md: "whichever primary stat a class calls its
// damage stat"). Strength/Agility drive a physical basic attack, Intellect a
// magic one. Returns "" for a class with none of the three.
func (c CharacterClass) DamageStatKey() string {
	for _, s := range c.PrimaryStats {
		if s == "strength" || s == "agility" || s == "intellect" {
			return s
		}
	}
	return ""
}

// Colors holds the two display colors for a character class.
// Values are 6-digit hex strings without a leading '#'.
type Colors struct {
	Major string `json:"major"`
	Minor string `json:"minor"`
}
